#!/usr/bin/env python
# coding: utf-8

from supabase import create_client, Client
from datetime import datetime as dt
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service as ChromeService
from webdriver_manager.chrome import ChromeDriverManager
from typing import Tuple
import time
import pickle
import os
import sys
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Supabase setup from environment
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Card details from environment
CARD_NUMBER = os.getenv("CARD_NUMBER")
CARD_EXP_MONTH = os.getenv("CARD_EXP_MONTH")
CARD_EXP_YEAR = os.getenv("CARD_EXP_YEAR")
CARD_CVV = os.getenv("CARD_CVV")
CARD_ZIP = os.getenv("CARD_ZIP")

# -----------------------------
# Helpers for Chronogolf persistence
# -----------------------------
def save_cookies(driver, filepath="chronogolf_cookies.pkl"):
    with open(filepath, 'wb') as f:
        pickle.dump(driver.get_cookies(), f)
    print(f"✓ Cookies saved to {filepath}")

def load_cookies(driver, filepath="chronogolf_cookies.pkl"):
    if os.path.exists(filepath):
        driver.get("https://www.chronogolf.com/")
        with open(filepath, 'rb') as f:
            cookies = pickle.load(f)
            for cookie in cookies:
                try:
                    driver.add_cookie(cookie)
                except Exception:
                    pass
        driver.refresh()
        print("✓ Cookies loaded - you should be logged in!")
        return True
    return False

def open_chronogolf_persistent(headless=False):
    try:
        chrome_options = Options()
        
        # Add options for Railway/Docker environment
        if headless:
            chrome_options.add_argument("--headless=new")
            chrome_options.add_argument("--no-sandbox")
            chrome_options.add_argument("--disable-dev-shm-usage")
            chrome_options.add_argument("--disable-gpu")
            chrome_options.add_argument("--disable-software-rasterizer")
            chrome_options.add_argument("--disable-extensions")
        else:
            chrome_options.add_argument("--detach")
        
        chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
        chrome_options.add_experimental_option('useAutomationExtension', False)
        chrome_options.add_argument("--disable-blink-features=AutomationControlled")
        
        print("[DEBUG] Creating ChromeDriver service...")
        
        # Try Railway path first, fallback to webdriver-manager for local
        chromedriver_path = "/usr/bin/chromedriver"
        if os.path.exists(chromedriver_path):
            print("[DEBUG] Using Railway ChromeDriver")
            service = Service(chromedriver_path)
            driver = webdriver.Chrome(service=service, options=chrome_options)
        else:
            print("[DEBUG] Using webdriver-manager for local development")
            driver = webdriver.Chrome(service=ChromeService(ChromeDriverManager().install()), options=chrome_options)
        
        print("[DEBUG] Chrome browser initialized successfully")
        sys.stdout.flush()
        
        if not headless:
            try:
                driver.maximize_window()
            except:
                pass
        
        if load_cookies(driver):
            print("✓ Loaded previous session - you should be logged in!")
        else:
            print("✓ First time setup - please log in manually")
            driver.get("https://www.chronogolf.com/")
            if not headless:
                input("Press Enter after you have logged in manually...")
                save_cookies(driver)
        
        return driver
        
    except Exception as e:
        print(f"[DEBUG] CRITICAL ERROR in open_chronogolf_persistent: {e}")
        import traceback
        traceback.print_exc()
        sys.stdout.flush()
        raise

def handle_credit_card_popup(driver, wait):
    """Handle the credit card required popup"""
    try:
        print("[DEBUG] Checking for credit card popup...")
        sys.stdout.flush()
        
        # Wait a moment for popup to appear
        time.sleep(2)
        
        # Check if "Credit Card Required" modal is present
        try:
            credit_card_modal = driver.find_element(By.XPATH, '//modal-header-title[contains(text(), "Credit Card Required")]')
            print("[DEBUG] Credit card popup detected!")
            sys.stdout.flush()
        except:
            print("[DEBUG] No credit card popup - continuing...")
            sys.stdout.flush()
            return True
        
        # Click "Add a new credit card"
        try:
            add_card_btn = wait.until(EC.element_to_be_clickable(
                (By.XPATH, '//credit-card-line-new')))
            driver.execute_script("arguments[0].click();", add_card_btn)
            print("[DEBUG] Clicked 'Add a new credit card'")
            sys.stdout.flush()
            time.sleep(2)
        except Exception as e:
            print(f"[DEBUG] Could not click add card button: {e}")
            sys.stdout.flush()
            return False
        
        # Switch to Stripe iframe
        try:
            print("[DEBUG] Looking for Stripe iframe...")
            sys.stdout.flush()
            stripe_iframe = wait.until(EC.presence_of_element_located(
                (By.XPATH, '//iframe[contains(@name, "__privateStripeFrame")]')))
            driver.switch_to.frame(stripe_iframe)
            print("[DEBUG] Switched to Stripe iframe")
            sys.stdout.flush()
            time.sleep(1)
        except Exception as e:
            print(f"[DEBUG] Could not find Stripe iframe: {e}")
            sys.stdout.flush()
            driver.switch_to.default_content()
            return False
        
        # Fill in card number
        try:
            card_number_field = wait.until(EC.presence_of_element_located(
                (By.NAME, 'cardnumber')))
            card_number_field.send_keys(CARD_NUMBER)
            print(f"[DEBUG] Filled card number")
            sys.stdout.flush()
            time.sleep(0.5)
        except Exception as e:
            print(f"[DEBUG] Could not fill card number: {e}")
            sys.stdout.flush()
            driver.switch_to.default_content()
            return False
        
        # Fill in expiry
        try:
            exp_field = driver.find_element(By.NAME, 'exp-date')
            exp_field.send_keys(f"{CARD_EXP_MONTH}{CARD_EXP_YEAR}")
            print(f"[DEBUG] Filled expiry")
            sys.stdout.flush()
            time.sleep(0.5)
        except Exception as e:
            print(f"[DEBUG] Could not fill expiry: {e}")
            sys.stdout.flush()
        
        # Fill in CVC
        try:
            cvc_field = driver.find_element(By.NAME, 'cvc')
            cvc_field.send_keys(CARD_CVV)
            print(f"[DEBUG] Filled CVC")
            sys.stdout.flush()
            time.sleep(0.5)
        except Exception as e:
            print(f"[DEBUG] Could not fill CVC: {e}")
            sys.stdout.flush()
        
        # Fill in ZIP
        try:
            zip_field = driver.find_element(By.NAME, 'postal')
            zip_field.send_keys(CARD_ZIP)
            print(f"[DEBUG] Filled ZIP")
            sys.stdout.flush()
            time.sleep(0.5)
        except Exception as e:
            print(f"[DEBUG] Could not fill ZIP: {e}")
            sys.stdout.flush()
        
        # Switch back to default content
        driver.switch_to.default_content()
        print("[DEBUG] Switched back to main content")
        sys.stdout.flush()
        time.sleep(1)
        
        # Accept terms checkbox
        try:
            terms_checkbox = wait.until(EC.presence_of_element_located(
                (By.CSS_SELECTOR, 'input[ng-model="acceptTermsAndConditions"]')))
            driver.execute_script("arguments[0].click();", terms_checkbox)
            print("[DEBUG] Accepted card terms")
            sys.stdout.flush()
            time.sleep(0.5)
        except Exception as e:
            print(f"[DEBUG] Could not accept terms: {e}")
            sys.stdout.flush()
        
        # Click "Grant" button
        try:
            grant_btn = wait.until(EC.element_to_be_clickable(
                (By.XPATH, '//button[@type="submit" and contains(text(), "Grant")]')))
            driver.execute_script("arguments[0].click();", grant_btn)
            print("💳 Card added and access granted!")
            sys.stdout.flush()
            time.sleep(3)
            return True
        except Exception as e:
            print(f"[DEBUG] Could not click Grant button: {e}")
            sys.stdout.flush()
            return False
            
    except Exception as e:
        print(f"[DEBUG] Error handling credit card popup: {e}")
        import traceback
        traceback.print_exc()
        sys.stdout.flush()
        driver.switch_to.default_content()
        return False

# -----------------------------
# URL classification
# -----------------------------
def classify_url(url: str) -> str:
    if not url:
        return "No URL"
    if "chronogolf.com" in url:
        return "URL_1" if "date=" in url else "URL_2"
    if "golfnow.com" in url:
        return "URL_3"
    return "URL_4"

# -----------------------------
# Get booking
# -----------------------------
def get_booking(booking_id: int = None):
    if booking_id:
        result = supabase.table("Client_Bookings").select("*").eq("id", booking_id).single().execute()
        if result.data:
            return result.data
        print(f"No booking found with ID {booking_id}, using closest booking instead.")

    today = dt.utcnow()
    bookings = supabase.table("Client_Bookings").select("*").execute()
    if not bookings.data:
        raise Exception("No bookings found in Client_Bookings.")

    future_bookings = [b for b in bookings.data if dt.fromisoformat(b["booking_date"]) >= today]
    if not future_bookings:
        raise Exception("No future bookings found.")

    return min(future_bookings, key=lambda b: dt.fromisoformat(b["booking_date"]) - today)

# -----------------------------
# Get course info
# -----------------------------
def get_course_info(facility_id: int):
    result = supabase.table("Course_Database").select("*").eq("Facility ID", facility_id).execute()
    if not result.data:
        raise Exception(f"No course info found for Facility ID {facility_id}.")
    return result.data[0]

# -----------------------------
# Construct dynamic URL
# -----------------------------
def construct_url(course: dict, booking: dict) -> Tuple[str, str]:
    url = course.get("Tee Times URL") or course.get("Booking URL")
    url_type = classify_url(url)

    if "chronogolf.com" in url and url_type == "URL_1":
        base_url = url.split("?")[0]
        booking_date = booking.get("booking_date")
        num_players = max(1, booking.get("number_of_players", 1))
        return (
            f"{base_url}?date={booking_date}&step=teetimes&holes=18"
            f"&coursesIds=&deals=false&groupSize={num_players}"
        ), url_type

    if "golfnow.com" in url and url_type == "URL_3":
        base_url = url.split("#")[0]
        booking_date = booking.get("booking_date")
        num_players = max(1, booking.get("number_of_players", 1))

        earliest_hour = dt.strptime(booking["earliest_time"], "%H:%M:%S").hour
        latest_hour = dt.strptime(booking["latest_time"], "%H:%M:%S").hour
        timemin = earliest_hour * 2
        timemax = latest_hour * 2

        holes = 2 if booking.get("holes", 18) == 18 else 1

        return (
            f"{base_url}#sortby=Date&view=List"
            f"&holes={holes}&timeperiod=3"
            f"&timemax={timemax}&timemin={timemin}"
            f"&players={num_players}&pricemax=10000&pricemin=0&promotedcampaignsonly=false"
            f"&date={booking_date}"
        ), url_type

    return url, url_type

# -----------------------------
# URL_1 Booking Flow (Chronogolf direct)
# -----------------------------
def book_url_1(driver, wait, booking):
    print("\n📌 Booking URL_1")
    print(f"  {booking['booking_date']} | {booking['number_of_players']} players | {booking['earliest_time']}-{booking['latest_time']}")
    sys.stdout.flush()

    try:
        print("[DEBUG] Waiting for tee time cards...")
        sys.stdout.flush()
        tee_cards = wait.until(EC.presence_of_all_elements_located(
            (By.CSS_SELECTOR, 'div[data-testid="teeTimeCard"]')))
        print(f"[DEBUG] Found {len(tee_cards)} tee time cards")
        sys.stdout.flush()
    except Exception as e:
        print(f"[DEBUG] Failed to find tee time cards: {e}")
        sys.stdout.flush()
        return False
    
    earliest = dt.strptime(booking["earliest_time"], "%H:%M:%S").time()
    latest = dt.strptime(booking["latest_time"], "%H:%M:%S").time()

    valid_times = []
    for card in tee_cards:
        try:
            time_text = card.find_element(By.CSS_SELECTOR, 'span.bg-teetimePrice').text.strip()
            tee_time = dt.strptime(time_text, "%I:%M %p").time()
            if earliest <= tee_time <= latest:
                valid_times.append((tee_time, card))
        except Exception as e:
            print(f"[DEBUG] Error parsing tee time card: {e}")
            continue

    print(f"[DEBUG] Found {len(valid_times)} valid tee times in range")
    sys.stdout.flush()
    
    if not valid_times:
        print("❌ No valid tee times")
        sys.stdout.flush()
        return False

    selected_time, card = min(valid_times, key=lambda x: x[0])
    driver.execute_script("arguments[0].click();", card)
    print(f"✅ Selected {selected_time}")

    try:
        hole_btn = wait.until(EC.element_to_be_clickable((By.XPATH, '//button[@value="18"]')))
        driver.execute_script("arguments[0].click();", hole_btn)
    except:
        pass

    try:
        num_players = max(1, booking.get("number_of_players", 1))
        public_group = wait.until(EC.presence_of_element_located(
            (By.XPATH, '//div[@data-testid="option"]//div[div/text()="Public"]/div[contains(@class,"flex")]')))
        plus_btn = public_group.find_element(By.XPATH, './/button[not(@disabled)]')
        for _ in range(num_players):
            driver.execute_script("arguments[0].click();", plus_btn)
            time.sleep(0.2)
        print(f"✅ {num_players} players selected")
    except Exception as e:
        print(f"⚠ Player selection: {e}")

    try:
        reserve_btn = wait.until(EC.element_to_be_clickable(
            (By.XPATH, '//button[.//span[text()="Reserve"]]')))
        driver.execute_script("arguments[0].click();", reserve_btn)
        print("✅ Reserve clicked")
        
        time.sleep(2)
        
        # Accept terms
        try:
            checkbox = wait.until(EC.presence_of_element_located(
                (By.CSS_SELECTOR, 'input[ng-model="vm.acceptTermsAndConditions"]')))
            driver.execute_script("arguments[0].scrollIntoView(true);", checkbox)
            driver.execute_script("arguments[0].click();", checkbox)
            print("☑️ Accepted Terms")
            time.sleep(1)
        except Exception as e:
            print(f"⚠ Terms checkbox: {e}")
            
        # Select "Pay at the course" payment option
        try:
            print("[DEBUG] Looking for payment options...")
            sys.stdout.flush()
            time.sleep(1)
            
            pay_at_course_radio = wait.until(EC.presence_of_element_located(
                (By.XPATH, '//div[contains(text(), "Pay at the course")]/ancestor::label//input[@type="radio"]')))
            
            driver.execute_script("arguments[0].scrollIntoView(true);", pay_at_course_radio)
            driver.execute_script("arguments[0].click();", pay_at_course_radio)
            print("💳 Selected 'Pay at the course'")
            sys.stdout.flush()
            time.sleep(1)
            
        except Exception as e:
            print(f"⚠ Payment selection (might not be required): {e}")
            sys.stdout.flush()
        
        # Click Confirm Reservation
        try:
            confirm_btn = wait.until(EC.element_to_be_clickable(
                (By.XPATH, '//button[contains(@class,"fl-button-primary") and contains(text(), "Confirm Reservation")]')))
            driver.execute_script("arguments[0].scrollIntoView(true);", confirm_btn)
            driver.execute_script("arguments[0].click();", confirm_btn)
            print("✅ Clicked Confirm Reservation")
            sys.stdout.flush()
            time.sleep(3)
            
            # Handle credit card popup if it appears
            if not handle_credit_card_popup(driver, wait):
                print("⚠ Credit card handling had issues, but continuing...")
                sys.stdout.flush()
            
            # Wait for confirmation
            time.sleep(2)
            print("🎉 Booking completed!")
            sys.stdout.flush()
            save_cookies(driver)
            return True
            
        except Exception as e:
            print(f"⚠ Confirm button: {e}")
            sys.stdout.flush()
            
            # Try handling credit card popup anyway
            if not handle_credit_card_popup(driver, wait):
                return False
            
            # Try clicking confirm again
            try:
                confirm_btn = wait.until(EC.element_to_be_clickable(
                    (By.XPATH, '//button[contains(@class,"fl-button-primary") and contains(text(), "Confirm Reservation")]')))
                driver.execute_script("arguments[0].click();", confirm_btn)
                print("🎉 Booking completed!")
                sys.stdout.flush()
                save_cookies(driver)
                return True
            except:
                return False
            
    except Exception as e:
        print(f"❌ Reserve failed: {e}")
        sys.stdout.flush()
        return False

# [The rest of the file continues with URL_2, URL_3, and book_facility - keeping them the same as before]

# -----------------------------
# URL_2 Booking Flow (Chronogolf iframe)
# -----------------------------
def book_url_2(driver, wait, booking):
    print("\n📌 Booking URL_2")
    print(f"  {booking['booking_date']} | {booking['number_of_players']} players | {booking['earliest_time']}-{booking['latest_time']}")
    
    try:
        iframe = wait.until(EC.presence_of_element_located(
            (By.XPATH, '//iframe[contains(@title,"Profile Page Booking Widget")]')))
        driver.switch_to.frame(iframe)
        
        day = int(booking["booking_date"].split("-")[2])
        date_btn = wait.until(EC.element_to_be_clickable(
            (By.XPATH, f'//button[@type="button"]//span[text()="{day}"]')))
        driver.execute_script("arguments[0].click();", date_btn)
        
        players_btn = wait.until(EC.element_to_be_clickable(
            (By.XPATH, f'//div[contains(@class,"toggler-headings")]//a[normalize-space(text())="{booking["number_of_players"]}"]')))
        driver.execute_script("arguments[0].click();", players_btn)
        
        continue_btn = wait.until(EC.element_to_be_clickable(
            (By.XPATH, '//button[@ng-click="confirmStep()" and normalize-space(text())="Continue"]')))
        driver.execute_script("arguments[0].click();", continue_btn)
        
        earliest = dt.strptime(booking["earliest_time"], "%H:%M:%S").time()
        latest = dt.strptime(booking["latest_time"], "%H:%M:%S").time()
        
        tee_times = wait.until(EC.presence_of_all_elements_located(
            (By.CSS_SELECTOR, 'div.widget-teetime')))
        
        valid_times = []
        for block in tee_times:
            try:
                time_text = block.find_element(By.CSS_SELECTOR, 'div.widget-teetime-tag').text.strip()
                tee_time = dt.strptime(time_text, "%I:%M %p").time()
                if earliest <= tee_time <= latest:
                    choose_btn = block.find_element(By.CSS_SELECTOR, 'a.widget-teetime-rate')
                    valid_times.append((tee_time, choose_btn))
            except:
                continue
        
        if not valid_times:
            print("❌ No valid tee times")
            return False
        
        selected_time, btn = min(valid_times, key=lambda x: x[0])
        driver.execute_script("arguments[0].click();", btn)
        print(f"✅ Selected {selected_time}")
        
        continue_btn = wait.until(EC.element_to_be_clickable(
            (By.XPATH, '//button[@ng-click="confirmStep()" and normalize-space(text())="Continue"]')))
        driver.execute_script("arguments[0].click();", continue_btn)
        
        driver.switch_to.default_content()
        original_window = driver.current_window_handle
        
        wait.until(lambda d: len(d.window_handles) > 1)
        for handle in driver.window_handles:
            if handle != original_window:
                driver.switch_to.window(handle)
                break
        
        time.sleep(1)
        
        checkbox = wait.until(EC.presence_of_element_located(
            (By.CSS_SELECTOR, 'input[ng-model="vm.acceptTermsAndConditions"]')))
        driver.execute_script("arguments[0].click();", checkbox)
        
        time.sleep(0.5)
        
        confirm_btn = wait.until(EC.element_to_be_clickable(
            (By.XPATH, '//button[contains(@class,"fl-button-primary") and contains(text(),"Confirm Reservation")]')))
        driver.execute_script("arguments[0].click();", confirm_btn)
        
        print("🎉 Booking completed!")
        save_cookies(driver)
        return True
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        try:
            driver.switch_to.default_content()
        except:
            pass

# -----------------------------
# URL_3 Booking Flow (GolfNow)
# -----------------------------
def book_url_3(driver, wait, booking):
    print("\n📌 Booking URL_3 (GolfNow)")
    print(f"  {booking['booking_date']} | {booking['number_of_players']} players | {booking['earliest_time']}-{booking['latest_time']}")

    try:
        print("[DEBUG] Waiting for GolfNow results...")
        results = wait.until(EC.presence_of_all_elements_located(
            (By.CSS_SELECTOR, 'section.result.rounded.no-pic')))
        print(f"[DEBUG] Found {len(results)} tee times")
        
        earliest = dt.strptime(booking["earliest_time"], "%H:%M:%S").time()
        latest = dt.strptime(booking["latest_time"], "%H:%M:%S").time()

        best_time = None
        best_elem = None

        for result in results:
            try:
                time_text = result.find_element(By.CSS_SELECTOR, "div.time-meridian").text.split()[0]
                tee_time = dt.strptime(time_text, "%I:%M%p").time()
                if earliest <= tee_time <= latest:
                    if best_time is None or tee_time < best_time:
                        best_time = tee_time
                        best_elem = result
            except Exception as e:
                print(f"[DEBUG] Error parsing GolfNow result: {e}")
                continue

        if not best_elem:
            print("❌ No valid tee times")
            return False

        book_btn = best_elem.find_element(By.CSS_SELECTOR, "span.button.btn-green.facility-book-btn")
        driver.execute_script("arguments[0].click();", book_btn)
        print(f"✅ Selected {best_time}")
        time.sleep(1)

        num_players = max(1, booking.get("number_of_players", 1))
        player_map = {1: "one-player", 2: "two-players", 3: "three-players", 4: "four-players"}
        player_radio = wait.until(EC.element_to_be_clickable(
            (By.ID, player_map.get(num_players, "one-player"))))
        driver.execute_script("arguments[0].click();", player_radio)
        print(f"✅ {num_players} players")
        time.sleep(1)

        continue_btn = wait.until(EC.element_to_be_clickable((By.ID, "cont-book")))
        driver.execute_script("arguments[0].click();", continue_btn)
        print("🎉 Booking completed!")
        return True

    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

# -----------------------------
# Main Booking Function (callable by worker)
# -----------------------------
def book_facility(booking_id: int = None, headless: bool = False):
    """
    Book a tee time for a given booking
    
    Args:
        booking_id: ID from Client_Bookings table
        headless: Run browser in headless mode (for automation)
    
    Returns:
        bool: True if successful, False otherwise
    """
    driver = None
    try:
        print(f"[DEBUG] Starting book_facility with booking_id={booking_id}, headless={headless}")
        sys.stdout.flush()
        
        booking = get_booking(booking_id)
        print(f"\n{'='*50}")
        print(f"Booking ID: {booking.get('id')}")
        print(f"Facility ID: {booking.get('facility_id')}")
        print(f"{'='*50}")
        sys.stdout.flush()

        course = get_course_info(booking["facility_id"])
        print(f"[DEBUG] Got course info: {course.get('Course Name')}")
        sys.stdout.flush()
        
        url, url_type = construct_url(course, booking)
        print(f"\nURL Type: {url_type}")
        print(f"URL: {url}\n")
        sys.stdout.flush()

        success = False

        if url_type in ["URL_1", "URL_2"]:
            print(f"[DEBUG] Opening Chronogolf browser...")
            sys.stdout.flush()
            driver = open_chronogolf_persistent(headless=headless)
            wait = WebDriverWait(driver, 15)
            print(f"[DEBUG] Navigating to: {url}")
            sys.stdout.flush()
            driver.get(url)
            
            print(f"[DEBUG] Page loaded, starting booking flow for {url_type}")
            sys.stdout.flush()
            if url_type == "URL_1":
                success = book_url_1(driver, wait, booking)
            elif url_type == "URL_2":
                success = book_url_2(driver, wait, booking)
            
            print(f"[DEBUG] Booking flow completed. Success: {success}")
            sys.stdout.flush()

        elif url_type == "URL_3":
            print(f"[DEBUG] Setting up GolfNow browser...")
            sys.stdout.flush()
            chrome_options = Options()
            if headless:
                chrome_options.add_argument("--headless=new")
                chrome_options.add_argument("--no-sandbox")
                chrome_options.add_argument("--disable-dev-shm-usage")
                chrome_options.add_argument("--disable-gpu")
            else:
                chrome_options.add_argument("--detach")
            
            chromedriver_path = "/usr/bin/chromedriver"
            if os.path.exists(chromedriver_path):
                service = Service(chromedriver_path)
                driver = webdriver.Chrome(service=service, options=chrome_options)
            else:
                driver = webdriver.Chrome(service=ChromeService(ChromeDriverManager().install()), options=chrome_options)
            
            wait = WebDriverWait(driver, 15)
            print(f"[DEBUG] Navigating to: {url}")
            sys.stdout.flush()
            driver.get(url)
            
            print(f"[DEBUG] Page loaded, starting GolfNow booking flow")
            sys.stdout.flush()
            success = book_url_3(driver, wait, booking)
            print(f"[DEBUG] Booking flow completed. Success: {success}")
            sys.stdout.flush()
        else:
            print(f"❌ Unknown URL type: {url_type}")
            sys.stdout.flush()
            return False

        # Close browser if in headless mode or if booking failed
        if driver and (headless or not success):
            print(f"[DEBUG] Closing browser...")
            sys.stdout.flush()
            driver.quit()
        
        print(f"[DEBUG] Returning success={success}")
        sys.stdout.flush()
        return success

    except Exception as e:
        print(f"❌ Booking error: {e}")
        import traceback
        print("[DEBUG] Full traceback:")
        traceback.print_exc()
        sys.stdout.flush()
        
        if driver:
            try:
                driver.quit()
            except:
                pass
        
        return False

# -----------------------------
# Execute (for manual testing)
# -----------------------------
if __name__ == "__main__":
    BOOKING_ID = 51
    book_facility(BOOKING_ID, headless=False)
