# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/2.0.0/).

## [1.1.0] - 2026-11-24

### Added

- Duplicate protection for the save keys. An image that was already downloaded from this browser is not saved a second time, and a batch press downloads only the images it has not saved yet. The record lives in `browser.storage.local` under `downloadHistory` and expires after seven days.

### Changed

- The project is now named One-Handed NovelAI and lives at `apoapostolov/one-handed-novelai-for-firefox`. The add-on id stays `novelai-hotkeys@apoapostolov`, so an existing install keeps updating.
- The manifest description now names the real default keys, `Z` and `X`.

## [1.0.0] - 2026-11-19

### Added

- Keyboard controls for the NovelAI image page: `C` focuses the prompt, `Z` generates the next image and `X` downloads the newest image.
- A toolbar popup to rebind or disable each shortcut, toggle the typing guard and action toast, and choose whether downloads ask for a location.
- An optional shortcut that downloads up to four images from the latest generation.
- CSS selector overrides for the Generate button, result images and prompt field when NovelAI changes its markup.
- A hero image, a 512px hero icon and a captured settings screenshot for the public release.
