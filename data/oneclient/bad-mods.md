hash - sha1

If a mod should be only flagged on one version, provide only the mods hash (works only for one mc-version)
If it should flag the whole project, provide it with the project-id (works for all mc-versions)
Name and author should only be involved if no hash or project-id is provided

# Template

```json
{
    "bad-mods": [
        {
            "hash": "28b67391892582747bd17a7525318a954e54c80a", // xaero's minimap hash fro 26.3 fabric
            "project-ids": {
                "modrinth": "1bokaNcj", // xaero's minimap project id on modrinth
                "curseforge": "263420" // same on curseforge
            },
            "name": "Xaero's Minimap",
            "author": "xaero96",
            "alternatives": [
                {
                    "hash": "d1741855c0e2b433f615c25e61c211b594dc525d", // hash for biomes o' plenty (just for test)
                    "project-ids": {
                        "modrinth": "HXF82T3G",
                        "curseforge": "220318"
                    }
                },
                {
                    "hash": "04739b04815269648fb885526b2c2ff2266e0cc5",
                    "project-ids": {
                        "modrinth": "OhduvhIc"
                    }
                }
            ]
        }
    ]
}
```