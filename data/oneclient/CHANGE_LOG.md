# 2.3.0

- automatically clear out any corrupted files
- feat: let new installs choose the data folder
- feat: better UX with folder data changing
- chore: log console should enable "debug" log filter by default
- fix: declining TOS no longer skips onboarding
- chore: make decling and accepting TOS better
- fix onboarding being completely reprompted when TOS updates
- chore: ignore weird java awt natives loading
- Revert "fix: stop rejecting java installations over an awt probe"
- fix: debug page resetting onboarding state
- perf: optimize mod toggling
- fix: verify and repair missing natives
- fix: fixed hidden mods being enabled on every launch
- fix: allow both path forms in allowed_symlinks.txt
- fix: stop rejecting java installations over an awt probe
- perf: extract archives off the caller's executor
- fix: browser markdown
- feat: added an option for starting the launcher maximized
- chore: sorted cluster settings
- feat: shortcuts
- feat: local mods support
- feat: added checking for bundle updates on game launch
- feat: added an opt-in flow for bundle mods shipped disabled
- feat: resource packs and shaders quiet reload
- feat: lower the default memory on lower memory machines
- feat: prefer the dedicated gpu on windows
- chore: added dedicated gpu flags
- feat: added a don't show again option to the update prompt
- feat: added New/Updated badges to cluster package lists
- feat: added context menu inside the screenshot viewer
- feat: added context menu on homepage clusters
- feat: added a picker for the amount of columns in a row
- feat: added MB4/MB5 and Esc navigation globally
- fix: stop a stray console window opening on windows
- chore: drop duplicate crate-local sqlx cache
- feat: launcher data folder
- fix: stray java runtime tmps and version files
- feat: delete mods from dead bundles
- feat: added ability to decline TOS
- chore: migrated to freya 0.5.0-rc.4
- feat: added memory allocation presets to minecraft and cluster settings
- feat: implemented disabling animations
- feat: added rerender when new screenshot is taken
- chore: try to auto update in case of startup crash
- fix: make back button on settings page not count sidebar items
- fix: scrollbar obscuring the file path
- fix: text that was visible in the center on stats
- fix: fixed memory input changing to default on every app launch
- feat: added progress bar on first launch screen; changed progress bar to reusable component (there were 4 duplicates)
- completely wipe out hickory

# 2.2.3

- feat: added cosmetic navbar link
- fix: fixed 404 response from curseforge
- feat: added rerendering after every new java runtime addition
- Fix/refreshing account doesnt change username
- Decrease minimum RAM allocation in JVM
- feat: added funfacts changing on background change
- feat: added search bar into Game Output live logs
- fix(app): normalize trackpad scroll deltas on macOS
- chore: changed ping url from gstatic to 1.1.1.1
- fix: panic caused by min > max
- feat: changed windows stack memory from 1MB to 8MB (same as Linux and MacOS)
- fix(misc): bring back accidentally removed comment
- fix mod card toggle taking 20 years

# 2.2.2

- fix: increase z-index of label in home recents row
- fix: migration issues, cluster preparation and sentry logging
- add one more check for awt
- actually properly check for AWT

# 2.2.1

- maybe improve visual code bundling
- package visual c++ directly in windows installer
- fix liquid glass icon

# 2.2.0

- fix(core): bundle overrides being problematic
- feat(logs): live launcher log console in its own window
- fix(auth): actually cancel an in-flight Microsoft sign-in
- feat(search): make cluster package search fuzzy
- refactor(java): simpler java check
- fix(ui): player preview is properly rendered now
- chore(game): remove string dedup in jvm args
- chore(ui): accounts page part of the settings layout
- feat(ui): hidden bundle packages filter
- feat(updater): allow disabling the updater through an environment variable
- fix(ui): make GPU cache limit 512mb instead of 32mb

# 2.1.5

- fix(core): fix downloading libraries properly
- feat(ui): add a huge warning when people try to install skyblock mods
- fix(java): revert JVM back to G1GC
- fix(core): update dependencies, may fix graphical glitches

# 2.1.4

- feat: auto-repair as well as verify cluster button in cluster settings
- feat(ui): browser package better multi-version management
- feat(ui): browser grid tags and install button on package cards
- feat(ui): check browser package updates on game launch instead
- feat(ui): per-cluster update prompt for browser content
- feat(content): check browser-installed packages for newer versions
- feat(db): browser package update cache and per-profile update mode
- fix(ui): hide bundle packages marked hidden from the package manager (except in "All" category)
- fix(ui): scope package manager search to the actively viewed category
- feat(ui): rename External tab to Browser and add toolbar browse action
- fix(ui): disable the launch button on click, not until first message response
- fix(core): disallow launching multiple instances so fast
- feat(ui): install packages straight from the listing
- feat(java): prefer JDKs, require java.awt, install kits only
- chore(onboarding): better pre-download toggle description

# 2.1.3

- fix(core): disable hickory dns on windows fixing failed requests
- feat(ui): storage manager
- fix(core): package deletion works properly now

# 2.1.2
- feat(core): utilize better JVM args for better JVM garbage collection
- fix(ui): fix startup overlaying on bundle updates
- fix(core): package downloading with dependencies actually downloads required dependencies now

# 2.1.1

- fix(ui): version art gets properly prefetched
- feat(ui): browser navbar tab + better installation feedback
- fix(core): disabled packages don't enable themselves after updating
- fix: recent cards sizing issue
- fix(ui): status bar close button, and the layer saturation behind it
- feat(ui): JVM arguments setting
- feat(content): make mod toggles work while the game is running
- fix(ui): rotate the changelog chevron with the accordion
- fix(content): stop removed bundle mods coming back
- fix(ui): render the connectivity status bar message properly
- fix(ui): keep bundle update text from covering the navbar
- chore: update to freya 0.4 (fixes browser freeze issue)

# 2.1.0

- feat(ui): toasts pause on hover + bunch of small general tweaks
- feat(ui): better looking bundle updates
- feat(ui): show all individual versions
- fix(core): shader configs are persisted across launches
- fix(core): better parallelisation for downloads and tweaked visual download elements
- feat(ui): file/folder drag and drop is now global across the app and prompts the user regarding the import
- feat: add RPM builds, deduplicate .exe and .appimage and disable autoupdating on linux builds that aren't appimages
- feat(core): better sentry error reporting regarding stacktraces and errors
- fix(ui): macOS window border
- feat(ui): Window corner radius is now dynamic on Windows and Linux, whereas on macOS native window attributes are used
- feat(ui): Added debouncing to the browser search input
- feat(ui): Make bundle updates prettier
- feat(ui): Add readable MS errors

# 2.0.1

- Fixed locating Java
- Fixed bundle updates not being applied
- Fixed auto updating on macOS
- Fixed stale shortcuts when updating from v1 to v2
- Switch from hickory to system DNS resolver on Windows

# 2.0.0
 
- Faster and efficient UI
- Efficient downloading and storage management
- Fixed bugs
