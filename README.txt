HELLO EPS — ADMIN-ONLY LOCAL MOCK TEST

Test login (created automatically by START-HELLO-EPS.bat)
Username: helloeps
Password: hello111@

The setup script creates the local .env settings, and the launcher configures
this test administrator in the PostgreSQL database before opening the mock test.

SETUP ON WINDOWS (NO DOCKER)
1. Extract this ZIP file to a normal folder (do not run it from inside the ZIP).
2. Make sure the PC has an internet connection.
3. Double-click START-HELLO-EPS.bat and allow Windows prompts.
4. The first run installs Node.js LTS, PostgreSQL 17 and the app packages. This can take several minutes.
5. The setup creates the local environment, configures the test login, and opens
   http://localhost:3000/mock-test.html.

IMPORTANT
- Windows Package Manager (winget / Microsoft App Installer) is required. If winget is missing, install/update App Installer from Microsoft Store and retry.
- Keep the black Hello EPS server window open while using the mock test. Close it to stop the local website.
- This runs only on this PC. It is not published online and is not accessible to other people over the internet.
- The database and app data remain on this PC. Back up the folder/database before reinstalling Windows.
- The .env file contains local database credentials; do not share it publicly.

DESIGN UPDATE
The public website now includes a refined institutional design layer: cleaner spacing, improved typography, more consistent cards and forms, responsive refinements, subtle interaction states and accessibility-focused keyboard outlines. Existing pages, exam functionality and server configuration are retained.


CONTENT MANAGEMENT (VACANCY / ANNOUNCEMENT / MEDIA)
- Public updates page: /updates.html
- Administrator manager: /content-admin.html
- Sign in using your configured Hello EPS administrator username and password.
- Publish vacancy notices, announcements, institute status posts, photos and videos (up to 100 MB).
- Delete posts from the Published Posts list; associated uploaded media is removed too.
- Requires the Node.js + PostgreSQL server. Static-only hosting cannot process secure uploads or persist posts.
