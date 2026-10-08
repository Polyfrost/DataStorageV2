# 2.7.0

- Add custom game args to settings
- fix: url opening, dgpu dropdown instead of switcher, invisible icons
- mods folder sync
- fix opt-in bundles not being asked for new mc versions
- chore: make nightly release action upload portable executables
- chore: add tooltip on settings system info
- feat: github packages can now be opened in browser
- chore: update description for launcher animation setting
- fix: mclogs notification showing repeatedly
- fix: match os argument rules on apple silicon for old versions
- feat: log censoring
- feat: add code block and update the open link dialogs with the code block
- chore: new changelog generator

# 2.6.1

- stray commas
- fix

# 2.6.0

- Reapply "chore: bump to 2.6.0"
- chore: deleted icons from stats views
- Revert "chore: bump to 2.6.0"
- fix: refresh loader version info and metadata manifests
- prompt for different mc versions when installing modpacks
- bundle opt out per content type
- exclude opted out bundles from package list
- fix: graphics drivers issues on linux in appimage
- fix: libxdo crash in deb packages
- chore: add JVM argument to improve vector operations on Java 21+
- chore: added enabling disabled bundled mods from browser
- feat: added warning on clicking cosmetics button
- ui: improve migration ui
- feat: optionally copy configs into dedicated-folder targets on migration
- feat: manual migration in both directions, only when there's something to copy
- improve more design elements
- improve design in some areas
- fix: key cached version info by loader format version
- feat: list/grid layout toggle on clusters page
- feat: group user-created OneClient clusters by release line
- feat: don't re-provision clusters the user deleted
- feat: use gallery images for package card banners
- fix: create config dir in file-lock override test
- split 1.21.x into minor drops
- pre-warm cluster art
- fix: use correct OneClient logo
- fix: swapped home screen cluster labels to show the cluster name in big text
- feat: package selection
- fix: clear all notifications shouldn't be clearing progress notis
- fix: libappindicator crashing and bundling on linux
- feat: working modpacks from modrinth and curseforge as well as manually imported; couple ui fixes
- chore: forcefully migrate old launcher path to new path
- wipe off incompatible mc version check entirely
- feat: better versions UI
- feat: list required dependencies in the browser versions page
- feat: improved stats screen
- fix: fixed worlds and datapacks tabs jumping in
- feat: custom cluster instances
- fix: move (almost) all IO off the UI thread
- fix: open crate on windows not opening urls properly
- chore: update dependencies and optimise archive operations
- chore: update open crate to fix issue on windows
- feat: polyplus mark and removal warning
- feat: release migration
- feat: worlds and datapacks views
- fix: rotate the advanced section chevron when it opens
- feat: added sections for advanced mods
- feat: bad mods flagging
- chore: deleted the download process from onboarding
- feat: added support for github hosted bundle mods
- feat: added deleting browser and local mods
- feat: added reseting back to the default options in settings tabs
- chore: changed the UX for optional mods modal
- fix: treat a missing discrete GPU setting as on
- fix: preserve executable bits when extracting Java runtimes
- remove unnecessary tests
- fix: it's -> its for possessive
- fix corrupted file detection
- chore: redesigned browser grid
- chore: redesigned package grid
- fix: homepage cover images are now in much better quality without bigger memory use
- chore: redesigned the navbar links to be pills
- chore: update freya and enable debug overlay in release
- rename Fabric (Ornithe) -> Fabric
- feat: system tray and process state controls
- feat: better text inputs
- Small QoL fixes: Java refresh, clipboard toasts, custom image endpoints
- chore(lint): cargo fmt
- fix: oneclient aur source publishes failing

# 2.5.1

- chore: update bundled packages only after cluster launch
- fix: update stale package metadata if it's supported versions were updated
- feat: better error handling for process hooks
- chore: optimize assets with oxipng
- Fix version-tag matching and bundle filtering
- ignore mc version check for tracked bundle mods

# 2.5.0

- chore: add flag to AUR PKGBUILD to prevent rustc from getting OOM killed
- feat: control center and smaller navbar link gaps
- fix: fixed most of the sizing issues in the launcher
- feat: added tooltips
- fix: fixed scrollbar overlapping with the scrollview content
- fix: fixed versions metadata not healing when unable to parse or read
- fix: incorrect database and filesystem structure of mods after updates

# 2.4.2

- fix: mod updates applying after launch and not before
- fix: mod updates not being symlinked to a clusters mods folder after update

# 2.4.1

- chore: improve stats page and cluster overview
- fix: issues with mod updating and mods randomly being disabled
- Reapply "fix: enable Wayland clipboard for image copy + align MSRV docs (#826)"

# 2.4.0

- tweak wording on stuff
- fix: symlinks
- fix: linux use dedicated GPU setting
- fix: issues caused by merges
- feat: added placeholder image for images that couldnt be decoded; fixed overflowing titles in mods view
- feat: added microsoft jdk and new shared mods folder layout
- feat: added resource packs and shaders sections inside browse view
- chore: added checking for browser autoupdater by published_at
- Add Ornithe support
- chore: only download bundle content in onboarding pre-download
- fix: cluster settings not inheriting value from global memory field
- chore: deleted corners on the app
- perf: optimise used memory

# 2.3.1

- chore: log freya info and switched to experimental branch with windows rendering fix
- fix: long launches caused by anti-corruption mechanism

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
