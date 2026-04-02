import csv
import os
import sys
import multiprocessing
import threading
import queue
from datetime import datetime
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import (
    TimeoutException,
    NoSuchElementException,
    StaleElementReferenceException,
    WebDriverException
)
from webdriver_manager.chrome import ChromeDriverManager
from concurrent.futures import ThreadPoolExecutor, as_completed

# ----------------
# Thread-safe counters
# ----------------
lock = threading.Lock()
progress = {
    "states_done": 0,
    "cities_done": 0,
    "courses_collected": 0,
    "online_booking_total": 0
}

csv_buffer = []
CSV_FLUSH_THRESHOLD = 50

# ----------------
# WebDriver Pool
# ----------------
class DriverPool:
    def __init__(self, size):
        self._pool = queue.Queue()
        for _ in range(size):
            self._pool.put(self._create_driver())

    def _create_driver(self):
        chrome_options = Options()
        chrome_options.add_argument("--headless=new")
        chrome_options.add_argument("--disable-blink-features=AutomationControlled")
        chrome_options.add_argument("--disable-gpu")
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        chrome_options.add_argument("--disable-extensions")
        chrome_options.add_argument("--disable-infobars")
        chrome_options.add_argument("--blink-settings=imagesEnabled=false")
        chrome_options.page_load_strategy = 'eager'
        service = Service(ChromeDriverManager().install())
        driver = webdriver.Chrome(service=service, options=chrome_options)
        driver.set_page_load_timeout(30)
        return driver

    def acquire(self, timeout=60):
        return self._pool.get(timeout=timeout)

    def release(self, driver):
        self._pool.put(driver)

    def quit_all(self):
        while not self._pool.empty():
            try:
                driver = self._pool.get_nowait()
                driver.quit()
            except Exception:
                pass

# ----------------
# Extract courses
# ----------------
def extract_courses_from_section(section):
    courses_data = []
    course_containers = section.find_elements(By.CSS_SELECTOR, "div[id^='course-']")
    for container in course_containers:
        try:
            facility_id = container.get_attribute("data-facilityid")
            details = container.find_element(By.CSS_SELECTOR, ".course-details")
            course_name = details.find_element(By.TAG_NAME, "h3").text
            address = details.find_element(By.TAG_NAME, "address").text.replace("\n", ", ")

            tee_times_url, tee_time_booking = "Not available", "No online booking available"
            btns = container.find_elements(By.CSS_SELECTOR, "a.button.btn-green.view-times.hide-for-small-only")
            if btns:
                tee_times_url = btns[0].get_attribute("href")
                tee_time_booking = "Online Tee Time Booking Available"

            courses_data.append({
                "facility_id": facility_id,
                "course_name": course_name,
                "address": address,
                "tee_times_url": tee_times_url,
                "tee_time_booking": tee_time_booking
            })

        except (NoSuchElementException, TimeoutException, StaleElementReferenceException):
            continue

    return courses_data

# ----------------
# Process a single city
# ----------------
def process_city(city, driver_pool, output_file, keys):
    driver = None
    try:
        driver = driver_pool.acquire(timeout=120)
        wait = WebDriverWait(driver, 15)
        courses = []
        try:
            driver.get(city["url"])

            # Wait for outer container
            container = wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, "div#on-platform-container")))

            # Wait for at least one course div to populate inside the container
            WebDriverWait(driver, 15).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, "div#on-platform-container div[id^='course-']"))
            )

            courses = extract_courses_from_section(container)

            with lock:
                progress["cities_done"] += 1
                progress["courses_collected"] += len(courses)
                print(f"✅ City done: {city['name']} | Total cities: {progress['cities_done']} | Total courses: {progress['courses_collected']}")

        except TimeoutException:
            print(f"⚠️ Timeout - No courses found for {city['name']}")
        except WebDriverException as e:
            print(f"⚠️ WebDriver error on {city['name']}: {e}")

        if courses:
            file_exists = os.path.isfile(output_file)
            with lock:
                with open(output_file, "a", newline="", encoding="utf-8") as f:
                    writer = csv.DictWriter(f, fieldnames=keys)
                    if not file_exists:
                        writer.writeheader()
                    writer.writerows(courses)

        return courses

    except Exception as e:
        print(f"⚠️ Unexpected error processing {city['name']}: {e}")
        return []
    finally:
        if driver:
            driver_pool.release(driver)

# ----------------
# Main scraper
# ----------------
def scrape_state(state_code, output_file):
    cpu_cores = multiprocessing.cpu_count()
    TOTAL_WORKERS = min(cpu_cores * 4, 16)
    POOL_SIZE = TOTAL_WORKERS + 2

    print(f"⚡ Driver pool size: {POOL_SIZE} | Worker threads: {TOTAL_WORKERS}")
    driver_pool = DriverPool(POOL_SIZE)

    keys = ["facility_id", "course_name", "address", "tee_times_url", "tee_time_booking"]

    state_url = f"https://www.golfnow.com/course-directory/us/{state_code.lower()}"
    print(f"🎯 Scraping state: {state_code.upper()} — {state_url}")

    # Get city list for this state
    driver = driver_pool.acquire()
    wait = WebDriverWait(driver, 15)
    city_links = []
    try:
        driver.get(state_url)
        city_elements = wait.until(
            EC.presence_of_all_elements_located(
                (By.CSS_SELECTOR, "section.city-courses .columns.large-4.medium-6 a")
            )
        )
        city_links = [
            {"name": el.text.strip(), "url": f"https://www.golfnow.com{el.get_attribute('href')}" if el.get_attribute("href").startswith("/") else el.get_attribute("href")}
            for el in city_elements if "Tee Times near" not in el.text
        ]
        print(f"State {state_code.upper()} - Found {len(city_links)} cities")
    except TimeoutException:
        print(f"⚠️ No cities found for state: {state_code.upper()}")
    finally:
        driver_pool.release(driver)

    # Process all cities in parallel
    with ThreadPoolExecutor(max_workers=TOTAL_WORKERS) as executor:
        futures = {
            executor.submit(process_city, city, driver_pool, output_file, keys): city
            for city in city_links
        }
        for future in as_completed(futures):
            try:
                future.result()
            except Exception as e:
                print(f"⚠️ City thread error: {e}")

    driver_pool.quit_all()
    print(f"\n✅ Done with {state_code.upper()} | Total courses: {progress['courses_collected']}")

# ----------------
# Run
# ----------------
if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("❌ Please provide a state code. Example: python GolfNow_scraper.py ca")
        sys.exit(1)

    state_code = sys.argv[1]
    output_dir = "output"
    os.makedirs(output_dir, exist_ok=True)
    output_file = os.path.join(output_dir, "Golf_Now_Courses.csv")

    scrape_state(state_code, output_file)

    print(f"\n🏌️ Data saved to: {output_file}")
    print(f"📊 Total courses collected: {progress['courses_collected']}")
    print(f"📊 Total courses with online booking: {progress['online_booking_total']}")
