# AGENTS.md

This repository is the Firefox build of One-Handed NovelAI. The Chrome build lives in a second repository with its own release schedule and store rules. Both builds ship the same extension to different browsers.

| Repository | Platform | Release artifact |
| --- | --- | --- |
| `apoapostolov/one-handed-novelai-for-firefox` (this one) | Firefox 140 or newer | `one-handed-novelai-<version>.xpi`, unsigned, loaded with signature checks off |
| `apoapostolov/one-handed-novelai-for-chrome` | Chrome 110 or newer | `one-handed-novelai-for-chrome-<version>.zip`, loaded unpacked |

Local checkouts: this repository at `C:/git-public/one-handed-novelai-for-firefox`, the Chrome repository at `C:/git-public/one-handed-novelai-for-chrome`.

## Shared code is one copy in two repositories

These files are byte-identical in both repositories:

```text
content.js
content.css
popup.html
popup.js
popup.css
```

A change to any of them is a change to both products. Do not write a Firefox variant or a Chrome variant of a shared file. When the two copies differ, whichever changed last is the intended code and the other repository is broken until it catches up, even though nothing in the second repository was edited.

## Platform files are separate on purpose

Each repository owns its own version of these files. Never copy them across with `cp`.

| File | This repository | Chrome repository |
| --- | --- | --- |
| `manifest.json` | `background.scripts`, `browser_specific_settings.gecko`, `data_collection_permissions`, `strict_min_version` | `background.service_worker`, `minimum_chrome_version`, no gecko block |
| `background.js` | returns the promise from `runtime.onMessage` | answers with `sendResponse` and returns `true` to keep the channel open |
| Release build | `tools/build_xpi.py` writes the xpi | `tools/build_zip.py` writes the zip |
| Tests | `tests/harness.mjs` | `tests/harness.mjs` and `tests/chrome-e2e.mjs` |
| README install section | temporary load, `xpinstall.signatures.required` | unpacked load, Web Store limits |
| `CHANGELOG.md` and `manifest.json` version | independent of the other repository | independent of the other repository |

One case crosses the line on purpose. A change to the download contract touches `background.js` in both repositories, and the two results stay different because the message-listener rule differs between the browsers. Make that change in both files in the same session.

Versions are not kept in step. A shared fix ships as its own release on each side, on that side's schedule. At the time of writing this build is 1.0.1 and the Chrome build is 1.0.0.

## Propagate a shared change

1. Edit the shared file in the repository you are working in.
2. Copy the finished file over the sibling checkout, keeping the bytes identical. Never retype the change in the second repository.
3. Prove the copies match:

   ```bash
   cd C:/git-public
   for f in content.js content.css popup.html popup.js popup.css; do
     cmp -s one-handed-novelai-for-firefox/$f one-handed-novelai-for-chrome/$f \
       && echo "same  $f" || echo "DIFF  $f"
   done
   ```

4. Run this repository's checks: `node tests/harness.mjs`.
5. Run the sibling's checks: `cd ../one-handed-novelai-for-chrome && node tests/harness.mjs && node tests/chrome-e2e.mjs`. The end-to-end run needs Chrome at `C:/Program Files/Google/Chrome/Application/chrome.exe` or `CHROME_PATH`.
6. Commit both repositories in the same session with the same subject line. The second commit names the first one in its body, so the pair can be found from either log.
7. Release each platform separately. Follow that repository's own changelog and tag rules, and never publish from one repository for the other.

## A shared change reaches the images as well

The popup screenshot shows the real popup. When `popup.html` or `popup.css` changes, retake `docs/settings-1.0.0.png` in both repositories at a 380x720 viewport with device scale 2, rerun `python tools/make_hero.py` here, and update `docs/screenshots.md` in both. The Chrome end-to-end run regenerates its own screenshot, and that repository's hero needs the rerun afterwards.

## Checks in this repository

```bash
node tests/harness.mjs
npx web-ext lint --source-dir . --ignore-files "tests/**" "tools/**" "docs/**" "*.xpi"
python tools/build_xpi.py
```

The harness covers the manifest shape, the message bridge, the shortcut bindings and the duplicate-download ledger. `web-ext lint` must stay at zero errors.
