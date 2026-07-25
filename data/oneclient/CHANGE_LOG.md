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
