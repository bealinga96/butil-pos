# Butil POS — Offline POS + Inventory (Android)

Fully offline. All data is stored on the device. The APK is built for you by GitHub Actions.

## Get the APK (no Android Studio needed)
1. Create a new GitHub repository.
2. Upload **everything in this folder**, including the hidden `.github` folder, `.gitignore`, `www/`, `package.json` and `capacitor.config.json`. Easiest way: unzip, then drag the contents into the repo with "Add file → Upload files". If the hidden `.github` folder is skipped, create `.github/workflows/build-apk.yml` manually and paste the file contents.
3. Commit to the `main` branch. The workflow **Build Android APK** starts automatically (or run it from the **Actions** tab → *Run workflow*).
4. When it turns green (about 5–8 min), open the run and download **Butil-POS-apk** under *Artifacts*. Unzip it to get `Butil-POS.apk`.
5. Copy the APK to the phone/tablet and install it (allow "Install unknown apps").

## Logins
| Role | Username | Password |
|---|---|---|
| Administrator | admin2026 | myAdmin26* |
| Staff | Staff26 | myStaff2026* |

Staff can only open **Sales (POS)** and **Receipts**, and are asked for their name at login.

## Notes
- Profit = (price − cost) × qty. Set each product's **Cost** in Inventory; if left at 0, profit equals sales.
- Barcodes are EAN-13 and auto-assigned. A scanner (keyboard-type) can be used in the POS search bar: scan, and the product is added.
- Excel download opens the Android share sheet (Save to Files / Drive / Excel).
- Data lives in the app. Clearing app storage or uninstalling erases it.
- Debug APK is installable directly. For Play Store release you would need a signed release build.
