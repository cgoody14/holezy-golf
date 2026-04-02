from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import NoSuchElementException, TimeoutException, StaleElementReferenceException
import time
import pandas as pd
import os

url = "https://www.chronogolf.com/clubs/United-States?page=1&filters=%257B%2522deals%2522%3Afalse%2C%2522onlineBooking%2522%3Atrue%257D"

options = webdriver.ChromeOptions()
options.add_argument("--headless")
options.add_argument("--no-sandbox")
options.add_argument("--disable-dev-shm-usage")
options.add_argument("--disable-gpu")
options.add_argument("--window-size=1920,1080")
options.add_argument("--disable-extensions")
options.add_argument("--disable-setuid-sandbox")

driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=options)


def get_booking_window_via_iframe(driver, wait):
    """
    Fallback: navigate the booking widget iframe to extract the booking window message.
    Steps: (More Dates if present) → Year button → Next x2 → any month → any date → Continue → any players → Continue → read alert
    """
    try:
        # Switch into the iframe
        iframe = WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, 'iframe[title="Profile Page Booking Widget"]'))
        )
        driver.switch_to.frame(iframe)

        # Click "More dates..." only if it exists
        try:
            more_dates = WebDriverWait(driver, 5).until(
                EC.element_to_be_clickable((By.CSS_SELECTOR, 'a.ng-binding[ng-click*="showDatelist = false"]'))
            )
            more_dates.click()
            time.sleep(1)
            print("    Clicked 'More dates...'")
        except TimeoutException:
            print("    No 'More dates...' found, proceeding directly to calendar.")

        # Click the title button to switch to year/month mode
        title_btn = WebDriverWait(driver, 10).until(
            EC.element_to_be_clickable((By.CSS_SELECTOR, 'button.uib-title'))
        )
        title_btn.click()
        time.sleep(0.5)

        # Click Next twice to advance years
        for _ in range(2):
            next_btn = WebDriverWait(driver, 5).until(
                EC.element_to_be_clickable((By.CSS_SELECTOR, 'button.uib-right'))
            )
            next_btn.click()
            time.sleep(0.5)

        # Click any available month
        month_btn = WebDriverWait(driver, 5).until(
            EC.element_to_be_clickable((By.CSS_SELECTOR, 'td.uib-month button:not([disabled])'))
        )
        month_btn.click()
        time.sleep(0.5)

        # Click any available day (not muted/greyed out)
        day_btn = WebDriverWait(driver, 5).until(
            EC.element_to_be_clickable((By.CSS_SELECTOR, 'td.uib-day button:not([disabled]) span:not(.text-muted)'))
        )
        day_btn.click()
        time.sleep(0.5)

        # Click Continue (date step)
        continue_btn = WebDriverWait(driver, 5).until(
            EC.element_to_be_clickable((By.CSS_SELECTOR, 'button[data-dd-action-target-name="widget-courses-continue"]'))
        )
        continue_btn.click()
        time.sleep(1)

        # Click any player count button (e.g. "1")
        player_btn = WebDriverWait(driver, 5).until(
            EC.element_to_be_clickable((By.CSS_SELECTOR, 'div.widget-step-players button.toggler-heading'))
        )
        player_btn.click()
        time.sleep(0.5)

        # Click Continue (players step)
        continue_btn2 = WebDriverWait(driver, 5).until(
            EC.element_to_be_clickable((By.CSS_SELECTOR, 'button[data-dd-action-target-name="widget-courses-continue"]'))
        )
        continue_btn2.click()
        time.sleep(1.5)

        # Read the booking window alert message
        alert_div = WebDriverWait(driver, 5).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, 'div.panel-alert.alert-danger span[ng-bind-html]'))
        )
        booking_window = alert_div.text.strip()

        driver.switch_to.default_content()
        return booking_window

    except Exception as e:
        driver.switch_to.default_content()
        print(f"    iframe fallback failed: {e}")
        return "N/A"


try:
    driver.get(url)

    all_clubs = []
    detailed_results = []
    wait = WebDriverWait(driver, 15)

    # Collect clubs until we have 5000
    while len(all_clubs) < 5000:
        wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, 'div[data-testid="search-grid"]')))

        last_height = driver.execute_script("return document.body.scrollHeight")
        while True:
            driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
            time.sleep(1.5)
            new_height = driver.execute_script("return document.body.scrollHeight")
            if new_height == last_height:
                break
            last_height = new_height

        club_elements = driver.find_elements(By.CSS_SELECTOR, 'a[href^="https://www.chronogolf.com/club"]')
        for elem in club_elements:
            try:
                href = elem.get_attribute("href")
                if href and href not in all_clubs:
                    all_clubs.append(href)
                if len(all_clubs) >= 5000:
                    break
            except StaleElementReferenceException:
                continue

        if len(all_clubs) >= 5000:
            break

        try:
            next_button = wait.until(EC.element_to_be_clickable((By.XPATH, "//button[@aria-label='Next Page']")))
            next_button.click()
            time.sleep(2)
        except (NoSuchElementException, TimeoutException):
            print("No more pages to load.")
            break

    print(f"Collected {len(all_clubs)} clubs.")

    for idx, club_url in enumerate(all_clubs, start=1):
        try:
            driver.get(club_url)

            wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, 'h1.mb-2.page-title-s')))
            course_name = driver.find_element(By.CSS_SELECTOR, 'h1.mb-2.page-title-s').text
            current_url = driver.current_url

            address, address_link, website, phone, booking_window = "N/A", "N/A", "N/A", "N/A", "N/A"

            # Contact info
            try:
                wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, 'div.flex.flex-col.gap-3')))
                info_links = driver.find_elements(By.CSS_SELECTOR, 'div.flex.flex-col.gap-3 a.underline')
                for link in info_links:
                    try:
                        href = link.get_attribute("href") or ""
                        text = link.text.strip()
                        if "maps" in href.lower():
                            address, address_link = text, href
                        elif href.startswith("http") and "chronogolf" not in href:
                            website = href
                        elif href.startswith("tel:"):
                            phone = text
                    except StaleElementReferenceException:
                        continue
            except TimeoutException:
                print(f"No contact info found for {course_name}")

            # Booking window — Method 1: direct teetimes div with date in URL
            if "date=" in current_url:
                try:
                    wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, "div#teetimes")))
                    clickable_date_div = driver.find_element(By.CSS_SELECTOR, "div#teetimes div.flex.cursor-pointer")
                    driver.execute_script("arguments[0].scrollIntoView({behavior: 'smooth', block: 'center'});", clickable_date_div)
                    time.sleep(1)
                    try:
                        clickable_date_div.click()
                    except:
                        driver.execute_script("arguments[0].click();", clickable_date_div)
                    info_banner = WebDriverWait(driver, 5).until(
                        EC.presence_of_element_located((By.CSS_SELECTOR, 'div.react-datepicker__children-container div.bg-info-surface'))
                    )
                    booking_window = info_banner.text.strip()
                except TimeoutException:
                    booking_window = "N/A"

            # Booking window — Method 2: iframe widget fallback if still N/A
            if booking_window == "N/A":
                try:
                    teetimes_div = driver.find_element(By.CSS_SELECTOR, "div#teetimes")
                    has_iframe = len(teetimes_div.find_elements(By.CSS_SELECTOR, 'iframe[title="Profile Page Booking Widget"]')) > 0
                    if has_iframe:
                        print(f"    Trying iframe fallback for {course_name}...")
                        booking_window = get_booking_window_via_iframe(driver, wait)
                except NoSuchElementException:
                    pass

            detailed_results.append({
                "Course Name": course_name,
                "Booking URL": current_url,
                "Address": address,
                "Address Link": address_link,
                "Course Website": website,
                "Phone": phone,
                "Booking Window": booking_window
            })

            print(f"[{idx}/{len(all_clubs)}] Extracted: {course_name} | Booking Window: {booking_window}")

            # Save progress every 50 clubs
            if idx % 50 == 0:
                os.makedirs("output", exist_ok=True)
                df = pd.DataFrame(detailed_results)
                df.to_csv("output/chronogolf_courses.csv", index=False, encoding="utf-8-sig")
                print(f"💾 Progress saved at {idx} clubs.")

        except Exception as e:
            print(f"Skipping {club_url}, error: {e}")
            continue

    # Final save
    os.makedirs("output", exist_ok=True)
    output_path = "output/chronogolf_courses.csv"
    df = pd.DataFrame(detailed_results)
    df.to_csv(output_path, index=False, encoding="utf-8-sig")
    print(f"\n✅ Results saved to: {output_path}")

except Exception as e:
    print(f"Error: {e}")

finally:
    driver.quit()
