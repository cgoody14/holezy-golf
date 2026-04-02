#!/usr/bin/env python
# coding: utf-8

# In[ ]:


import csv
import os
import multiprocessing
import threading
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

# ----------------
# WebDriver setup
# ----------------
def create_driver():
    chrome_options = Options()
    chrome_options.add_argument("--headless=new")
    chrome_options.add_argument("--disable-blink-features=AutomationControlled")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--disable-extensions")
    chrome_options.add_argument("--disable-infobars")
    service = Service(ChromeDriverManager().install())
    driver = webdriver.Chrome(service=service, options=chrome_options)
    return driver

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
def process_city(city):
    try:
        driver = create_driver()
        wait = WebDriverWait(driver, 6)
        courses = []
        try:
            driver.get(city["url"])
            container = wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, "div#on-platform-container")))
            courses = extract_courses_from_section(container)
            with lock:
                progress["cities_done"] += 1
                progress["courses_collected"] += len(courses)
                print(f"✅ City done: {city['name']} | Total cities: {progress['cities_done']} | Total courses: {progress['courses_collected']}")
        except TimeoutException:
            print(f"⚠️ Timeout - No courses found for {city['name']}")
        except WebDriverException as e:
            print(f"⚠️ WebDriver error on {city['name']}: {e}")
        finally:
            driver.quit()
        return courses
    except Exception as e:
        print(f"⚠️ Unexpected error processing {city['name']}: {e}")
        return []

# ----------------
# Process a single state
# ----------------
def process_state(state, max_threads_per_state, output_file, keys):
    try:
        start_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        print(f"\n🕒 Starting state: {state['name']} at {start_time}")

        driver = create_driver()
        wait = WebDriverWait(driver, 8)
        driver.get(state["url"])
        courses_in_state = []

        try:
            city_elements = wait.until(
                EC.presence_of_all_elements_located(
                    (By.CSS_SELECTOR, "section.city-courses .columns.large-4.medium-6 a")
                )
            )
            city_links = [
                {"name": el.text.strip(), "url": el.get_attribute("href")}
                for el in city_elements if "Tee Times near" not in el.text
            ]
            print(f"State {state['name']} - Found {len(city_links)} cities")

            with ThreadPoolExecutor(max_threads_per_state) as executor:
                futures = {executor.submit(process_city, city): city for city in city_links}
                for future in as_completed(futures):
                    try:
                        city_courses = future.result()
                        courses_in_state.extend(city_courses)
                    except Exception as e:
                        print(f"⚠️ Error in city thread {futures[future]['name']}: {e}")

        except TimeoutException:
            print(f"⚠️ No cities found for {state['name']}")
        finally:
            driver.quit()

        # Count online booking courses in this state
        online_booking_count = sum(
            1 for course in courses_in_state if course["tee_time_booking"] == "Online Tee Time Booking Available"
        )

        with lock:
            progress["states_done"] += 1
            progress["online_booking_total"] += online_booking_count
            print(
                f"🏌️ State finished: {state['name']} | "
                f"Total states: {progress['states_done']} | "
                f"Courses so far: {progress['courses_collected']} | "
                f"Online booking in {state['name']}: {online_booking_count}"
            )

        # Save state results to CSV immediately
        if courses_in_state:
            file_exists = os.path.isfile(output_file)
            with lock:  # lock to avoid race conditions when multiple states write
                with open(output_file, "a", newline="", encoding="utf-8") as f:
                    writer = csv.DictWriter(f, fieldnames=keys)
                    if not file_exists:  # write header only once
                        writer.writeheader()
                    writer.writerows(courses_in_state)
            print(f"💾 Saved {len(courses_in_state)} courses from {state['name']} to {output_file}")

        return courses_in_state

    except Exception as e:
        print(f"⚠️ Unexpected error processing state {state['name']}: {e}")
        return []

# ----------------
# Main scraper
# ----------------
def scrape_golf_courses(output_file):
    cpu_cores = multiprocessing.cpu_count()
    max_threads_states = max(1, cpu_cores // 2)
    max_threads_per_state = max(1, cpu_cores // 2)
    print(f"⚡ Using {max_threads_states} threads for states, {max_threads_per_state} threads per state for cities")

    main_driver = create_driver()
    main_wait = WebDriverWait(main_driver, 8)
    main_driver.get("https://www.golfnow.com/course-directory/us")
    state_elements = main_wait.until(
        EC.presence_of_all_elements_located((By.CSS_SELECTOR, ".us-destination-wrapper .col-20 a"))
    )
    state_links = [{"name": el.text.strip(), "url": el.get_attribute("href")} for el in state_elements]
    main_driver.quit()

    keys = ["facility_id", "course_name", "address", "tee_times_url", "tee_time_booking"]

    all_courses = []

    with ThreadPoolExecutor(max_threads_states) as executor:
        futures = {
            executor.submit(process_state, state, max_threads_per_state, output_file, keys): state
            for state in state_links
        }
        for future in as_completed(futures):
            try:
                state_courses = future.result()
                all_courses.extend(state_courses)
            except Exception as e:
                print(f"⚠️ Error in state thread {futures[future]['name']}: {e}")

    return all_courses

# ----------------
# Run scraper
# ----------------
if __name__ == "__main__":
    output_dir = "/Users/christiang/Desktop/Tee Buddy/Course Data"
    os.makedirs(output_dir, exist_ok=True)
    output_file = os.path.join(output_dir, "Golf_Now_Courses.csv")

    courses = scrape_golf_courses(output_file)

    print(f"\n🏌️ All course data saved to: {output_file}")
    print(f"📊 Total courses collected: {progress['courses_collected']}")
    print(f"📊 Total courses with online booking: {progress['online_booking_total']}")


# In[ ]:





# In[ ]:





# In[ ]:




