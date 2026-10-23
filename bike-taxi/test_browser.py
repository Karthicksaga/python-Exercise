"""Optional browser smoke test: requires Playwright and Chromium."""
import subprocess
import shutil
import os
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

def main():
    from playwright.sync_api import sync_playwright, expect
    with tempfile.TemporaryDirectory() as temp:
        env = dict(os.environ, BIKE_TAXI_DB=str(Path(temp)/'browser.sqlite3'), PORT='8011')
        process = subprocess.Popen([sys.executable,'server.py'],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        try:
            for attempt in range(50):
                try:
                    urllib.request.urlopen('http://127.0.0.1:8011/api/state').close()
                    break
                except OSError:
                    time.sleep(.1)
            with sync_playwright() as p:
                browser=p.chromium.launch(headless=True, executable_path=shutil.which('chromium'))
                rider=browser.new_context(viewport={'width':390,'height':844})
                driver=browser.new_context(viewport={'width':1280,'height':900})
                a,b=rider.new_page(),driver.new_page()
                errors=[]
                a.on('pageerror',lambda e:errors.append(str(e)))
                b.on('pageerror',lambda e:errors.append(str(e)))
                for page in (a,b): page.goto('http://127.0.0.1:8011')
                expect(a.locator('#book')).to_be_enabled()
                assert a.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
                a.screenshot(path='/tmp/bike-taxi-mobile.png',full_page=True)
                b.screenshot(path='/tmp/bike-taxi-desktop.png',full_page=True)
                a.locator('#book').click()
                expect(a.locator('#active')).to_contain_text('Finding a driver')
                b.locator('#driver-tab').click()
                b.get_by_role('button',name='Accept ride').click(timeout=10000)
                expect(a.locator('#active')).to_contain_text('Driver on the way',timeout=10000)
                pin=a.locator('.code').inner_text()
                b.get_by_role('button',name='I’m at pickup').click()
                b.get_by_label('Rider’s 4-digit pickup code').fill('0000')
                b.get_by_role('button',name='Start ride').click()
                expect(b.locator('#message')).to_contain_text('does not match')
                b.get_by_label('Rider’s 4-digit pickup code').fill(pin)
                b.get_by_role('button',name='Start ride').click()
                expect(a.locator('#active')).to_contain_text('Ride in progress',timeout=10000)
                b.get_by_role('button',name='Complete ride').click()
                expect(a.locator('#history')).to_contain_text('Completed',timeout=10000)
                expect(a.locator('#book')).to_be_visible()
                a.reload()
                expect(a.locator('#history')).to_contain_text('Completed')
                assert not errors,errors
                browser.close()
                print('PASS: mobile layout, two-browser booking lifecycle, wrong PIN rejection, history after reload, no JavaScript errors')
        finally:
            process.terminate()
            process.wait(timeout=5)


if __name__ == '__main__':
    main()
