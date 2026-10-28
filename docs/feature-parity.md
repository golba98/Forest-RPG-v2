# Feature parity and remaining review

| Area | Current implementation | Remaining work |
| --- | --- | --- |
| Forest and terrain | Seeded forests, rivers, bridges, hills, mud and tutorial | Review visual variety and playability across more seeds |
| Presentation | Sprite animation, weather, lighting, HUD/minimap, menus and settings | Full visual and accessibility acceptance; localization is not complete for every string |
| RPG | Combat, enemy behaviors, progression, inventory, tutorial and portal flow | Full balance and behavioral parity verification |
| Persistence | V2 local saves, import/export and legacy adapter | Frame-exact restoration of transient encounter state |
| Readiness | Automated tests, profiling scripts and static-host config | Resolve any full-suite failures, longer performance runs and real-device accessibility review |

The existing implementation and automated tests do not establish production readiness on their own.
