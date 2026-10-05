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
            "project-ids": {
                "modrinth": "1KVo5zza",
                "curseforge": "396246"
            },
            "name": "Fabulously Optimized",
            "author": "robotkoer",
            "explanation": "/oneclient/bad_modpacks_mds/test.md"
        }
    ]
}
```