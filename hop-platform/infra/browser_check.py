"""Browser test against isolated local services. Never point this at a real service.
Requires an existing development server, verified Keycloak test users in HOP_E2E_USERS,
and HOP_API_BINARY for the operator bootstrap command. See docs/TESTING.md.
"""
import json
import os
import shutil
import subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE = 'http://localhost:8080'
users = json.loads(Path(os.environ['HOP_E2E_USERS']).read_text())
binary = os.environ['HOP_API_BINARY']

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path=shutil.which('chromium'))
    contexts = {}
    pages = {}
    errors = []
    for role in ['operator', 'rider', 'driver']:
        context = browser.new_context(
            viewport={'width': 390, 'height': 844} if role == 'rider' else {'width': 1365, 'height': 1000},
            geolocation={'latitude': 13.0827, 'longitude': 80.2707, 'accuracy': 10},
            permissions=['geolocation'],
        )
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(BASE)
        expect(page.get_by_text('Development environment', exact=False)).to_be_visible()
        if role == 'rider':
            page.screenshot(path='/tmp/hop-production-mobile-landing.png', full_page=True)
        page.get_by_role('link', name='Sign in to get going').click()
        page.locator('#username').fill(users[role]['username'])
        page.locator('#password').fill(users[role]['password'])
        page.locator('#kc-login').click()
        page.wait_for_url(BASE+'/', timeout=20000)
        expect(page.get_by_role('button', name='Sign out')).to_be_visible()
        contexts[role] = context
        pages[role] = page

    op, rider, driver = pages['operator'], pages['rider'], pages['driver']
    account = op.request.get(BASE+'/api/me').json()['user']['id']
    subprocess.run([binary, 'promote-operator', account], check=True, stdout=subprocess.DEVNULL)
    op.reload()
    op.get_by_role('button', name='Operations', exact=True).click()
    for label, value in {
        'Area name': 'Chennai integration', 'State / territory': 'Tamil Nadu',
        'South latitude': '12.9', 'North latitude': '13.2', 'West longitude': '80.1', 'East longitude': '80.4',
        'Base fare (paise)': '1500', 'Per km (paise)': '800', 'Minimum fare (paise)': '2500',
        'Operational approval reference': 'INTEGRATION TEST ONLY — not a launch approval',
    }.items():
        op.get_by_label(label, exact=True).fill(value)
    op.get_by_label('Activate bookings in this area').check()
    op.get_by_role('button', name='Save area', exact=True).click()
    expect(op.get_by_role('status')).to_contain_text('Service area saved')

    driver.reload()
    driver.get_by_role('button', name='Drive with Hop', exact=True).click()
    for label, value in {
        'Vehicle registration': 'TEST1234', 'UPI ID (optional)': 'testdriver@bank',
        'Driving licence verification reference': 'TEST-LICENCE-REFERENCE', 'Licence expiry': '2028-01-01',
        'Insurance verification reference': 'TEST-INSURANCE-REFERENCE', 'Insurance expiry': '2028-01-01',
    }.items():
        driver.get_by_label(label, exact=True).fill(value)
    driver.get_by_role('button', name='Submit for review').click()
    expect(driver.get_by_text('pending', exact=True)).to_be_visible()
    op.get_by_role('button', name='Refresh', exact=True).click()
    op.locator('select[name="status"]').first.select_option('approved')
    op.get_by_label('Evidence reviewed and decision note').fill('INTEGRATION TEST ONLY: approved synthetic verification references')
    op.get_by_role('button', name='Save review', exact=True).click()
    expect(driver.get_by_role('button', name='Go online & share location')).to_be_visible(timeout=10000)
    driver.get_by_role('button', name='Go online & share location').click()
    expect(driver.get_by_text('● Location is fresh')).to_be_visible(timeout=15000)

    rider.reload()
    rider.get_by_label('Pickup', exact=True).fill('Central')
    rider.get_by_role('button', name='Chennai Central, Chennai', exact=True).click()
    rider.get_by_label('Destination', exact=True).fill('T Nagar')
    rider.get_by_role('button', name='T. Nagar, Chennai', exact=True).click()
    rider.get_by_role('button', name='See fare', exact=False).click()
    expect(rider.get_by_text('₹56.60', exact=True)).to_be_visible()
    assert rider.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Mobile horizontal overflow'
    rider.screenshot(path='/tmp/hop-production-mobile-booking.png', full_page=True)
    rider.get_by_role('button', name='Request a bike', exact=False).click()
    expect(rider.get_by_text('Finding your driver', exact=True)).to_be_visible()
    driver.get_by_role('button', name='Accept ride', exact=True).click(timeout=10000)
    expect(rider.get_by_text('Driver on the way', exact=True)).to_be_visible(timeout=10000)
    code = rider.locator('.pickup-code strong').inner_text()
    driver.get_by_role('button', name='I’m at pickup', exact=True).click()
    driver.get_by_label('Rider’s pickup code').fill('000000' if code != '000000' else '111111')
    driver.get_by_role('button', name='Start ride', exact=True).click()
    expect(driver.get_by_role('status').first).to_contain_text('Incorrect pickup code')
    driver.get_by_label('Rider’s pickup code').fill(code)
    driver.get_by_role('button', name='Start ride', exact=True).click()
    expect(rider.get_by_text('On your way', exact=True)).to_be_visible(timeout=10000)
    driver.get_by_role('button', name='Complete ride', exact=True).click()
    rider.get_by_role('button', name='Your rides', exact=True).click()
    expect(rider.get_by_text('Ride complete', exact=True)).to_be_visible(timeout=10000)
    expect(rider.get_by_text('Payment has not been confirmed.', exact=True)).to_be_visible()
    rider.get_by_role('button', name='Report a ride issue', exact=True).click()
    rider.get_by_label('What happened?').fill('Synthetic support report for browser verification.')
    rider.get_by_role('button', name='Send report', exact=True).click()
    rider.get_by_role('button', name='Support', exact=True).click()
    expect(rider.get_by_text('Synthetic support report for browser verification.', exact=True)).to_be_visible()
    rider.reload()
    rider.get_by_role('button', name='Your rides', exact=True).click()
    expect(rider.get_by_text('Ride complete', exact=True)).to_be_visible()
    op.screenshot(path='/tmp/hop-production-operations.png', full_page=True)
    assert not errors, errors
    rider.get_by_role('button', name='Sign out').click()
    expect(rider.get_by_role('link', name='Sign in to get going')).to_be_visible()
    browser.close()
    print('PASS: real Keycloak sign-in, operator activation, driver application/approval, mobile booking, live location heartbeat, pickup code, completion, unpaid state, support report, durable history, logout, and no JavaScript errors.')
