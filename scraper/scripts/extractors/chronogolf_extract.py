#!/usr/bin/env python
# coding: utf-8

# In[3]:


from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import NoSuchElementException, TimeoutException, StaleElementReferenceException
import time
import pandas as pd  # for saving to CSV

url = "https://www.chronogolf.com/clubs/United-States?page=1&filters=%257B%2522deals%2522%3Afalse%2C%2522onlineBooking%2522%3Atrue%257D"

driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()))

try:
    driver.maximize_window()
    driver.get(url)

    all_clubs = []
    detailed_results = []
    wait = WebDriverWait(driver, 15)

    # Collect clubs until we have 2000
    while len(all_clubs) < 2000:
        wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, 'div[data-testid="search-grid"]')))

        # Scroll until all clubs are visible
        last_height = driver.execute_script("return document.body.scrollHeight")
        while True:
            driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
            time.sleep(1.5)
            new_height = driver.execute_script("return document.body.scrollHeight")
            if new_height == last_height:
                break
            last_height = new_height

        # Re-fetch clubs fresh each loop
        club_elements = driver.find_elements(By.CSS_SELECTOR, 'a[href^="https://www.chronogolf.com/club"]')
        for elem in club_elements:
            try:
                href = elem.get_attribute("href")
                if href and href not in all_clubs:
                    all_clubs.append(href)
                if len(all_clubs) >= 2000:
                    break
            except StaleElementReferenceException:
                continue

        if len(all_clubs) >= 2000:
            break

        # Next page
        try:
            next_button = wait.until(EC.element_to_be_clickable((By.XPATH, "//button[@aria-label='Next Page']")))
            next_button.click()
            time.sleep(2)
        except (NoSuchElementException, TimeoutException):
            print("No more pages to load.")
            break

    print(f"Collected {len(all_clubs)} clubs.")

    # Visit first 2000 clubs and extract details
    for idx, club_url in enumerate(all_clubs[:2000], start=1):
        try:
            driver.get(club_url)

            # Course name
            wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, 'h1.mb-2.page-title-s')))
            course_name = driver.find_element(By.CSS_SELECTOR, 'h1.mb-2.page-title-s').text
            current_url = driver.current_url

            # Defaults
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

            # Booking window (only if ?date= in URL)
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

            detailed_results.append({
                "Course Name": course_name,
                "Booking URL": current_url,
                "Address": address,
                "Address Link": address_link,
                "Course Website": website,
                "Phone": phone,
                "Booking Window": booking_window
            })

            print(f"[{idx}/2000] Extracted: {course_name}")

        except Exception as e:
            print(f"Skipping {club_url}, error: {e}")
            continue

    # Print results
    for res in detailed_results:
        print("-" * 2000)
        for key, val in res.items():
            print(f"{key}: {val}")

    # Save results to CSV
    #output_path = "/Users/christiang/Desktop/Tee Buddy/Course Data/chronogolf_courses.csv"
    #df = pd.DataFrame(detailed_results)
    #df.to_csv(output_path, index=False, encoding="utf-8-sig")
    #print(f"\n✅ Results saved to: {output_path}")

except Exception as e:
    print(f"Error: {e}")

finally:
    driver.quit()


# In[ ]:




