hash - sha1

If a mod should be only flagged on one version, provide only the mods hash (works only for one mc-version and one mod version)
If it should flag the whole project, provide it with the project-id (works for all mc-versions and for all mod versions)
Name and author should only be involved if no hash or project-id is provided (it is a fallback, but can also be used for marking mods in the bad-mods.json)

All of the explanations should go to the `bad_mods_mds` folder inside `/oneclient/bad_mods_mds`

# Template

```json
{
    "bad-mods": [
        {
            "hash": "28b67391892582747bd17a7525318a954e54c80a",
            "project-ids": {
                "modrinth": "1bokaNcj",
                "curseforge": "263420"
            },
            "name": "Xaero's Minimap",
            "author": "xaero96",
            "explanation": "/oneclient/bad_mods_mds/test-markdown.md",
            "alternatives": [
                {
                    "hash": "d1741855c0e2b433f615c25e61c211b594dc525d",
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