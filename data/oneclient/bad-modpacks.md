hash - sha1

If a modpack should be only flagged on one version, provide only the modpacks hash (works only for one mc-version and one modpack version)
If it should flag the whole project, provide it with the project-id (works for all mc-versions and for all modpack versions)
Name and author should only be involved if no hash or project-id is provided (it is a fallback, but can also be used for marking modpacks in the bad-modpacks.json)

All of the explanations should go to the `bad_modpacks_mds` folder inside `/oneclient/bad_modpacks_mds`

# Template

```json
{
    "bad-modpacks": [
        {
            "hash": "28b67391892582747bd17a7525318a954e54c80a",
            "project-ids": {
                "modrinth": "1bokaNcj",
                "curseforge": "263420"
            },
            "name": "Xaero's Minimap",
            "author": "xaero96",
            "explanation": "/oneclient/bad_mods_mds/test.md",
        }
    ]
}
```