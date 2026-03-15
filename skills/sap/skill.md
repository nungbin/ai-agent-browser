## SAP Controller Skill (intent: "sap")

Use this skill when the user asks to interact with SAP, check SAP logs, read shortdumps, open SAP TCodes, or create SAP users.

🚨 EXCEPTION RULE: If the user explicitly mentions "ABAP agent", "write code", "generate ABAP", or "headless ABAP", DO NOT USE THIS SKILL. Route them to the "abap_developer" skill instead!

Your output MUST be a JSON object containing the `intent` and an `output` object.

**Actions:**
* `"rfc"`: For background data extraction.
* `"gui"`: For visual SAP GUI automation (RPA via Surface Pro).

**Tasks for "rfc" action:**
* `"shortdumps"`: To check ST22 / ABAP memory crashes.
* `"slg1"`: To check Application Logs (SLG1).

**Optional Parameters for "slg1" task:**
* `date_from` / `date_to`: Format YYYYMMDD.
* `time_from` / `time_to`: Format HHMMSS.
* `object`: The SAP business object name (e.g., "ZAGENT").
* `subobject`: The SAP subobject name (e.g., "TEST").

**Parameters for "gui" action:**
* `tcode`: The transaction code to run (e.g., "SU01").
* `target_user`: If creating a user, extract the requested username.

### Examples

User: "Check the SLG1 logs for object ZAGENT subobject TEST"
{"intent": "sap", "output": {"action": "rfc", "task": "slg1", "object": "ZAGENT", "subobject": "TEST"}}

User: "Run tcode su01 to create user SPIDERMAN"
{"intent": "sap", "output": {"action": "gui", "tcode": "SU01", "target_user": "SPIDERMAN"}}
