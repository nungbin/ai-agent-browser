## SAP Controller Skill (intent: "sap")

Use this skill when the user asks to interact with SAP, check SAP logs, read shortdumps, open SAP TCodes, or create SAP users.

Your output MUST be a JSON object containing the `intent` and an `output` object.

**Actions:**

* `"rfc"`: For background data extraction.

* `"gui"`: For visual SAP GUI automation (RPA via Surface Pro).

**Tasks for "rfc" action:**

* `"shortdumps"`: To check ST22 / ABAP memory crashes.

* `"slg1"`: To check Application Logs (SLG1).

**Optional Parameters for "slg1" task:**
If the user specifies dates, times, or object names, include them:

* `date_from` / `date_to`: Format YYYYMMDD.

* `time_from` / `time_to`: Format HHMMSS.

* `object`: The SAP business object name (e.g., "ZAGENT").

* `subobject`: The SAP subobject name (e.g., "TEST").

**Parameters for "gui" action:**
If the user asks to "run a tcode", "create a user", or "use SAP GUI", you MUST use the "gui" action.

* `tcode`: The transaction code to run (e.g., "SU01").

* `target_user`: If the user asks to create a user, extract the requested username and put it here.

### Examples

User: "Check the SLG1 logs for object ZAGENT subobject TEST"
{"intent": "sap", "output": {"action": "rfc", "task": "slg1", "object": "ZAGENT", "subobject": "TEST"}}

User: "Run tcode su01 to create user SPIDERMAN"
{"intent": "sap", "output": {"action": "gui", "tcode": "SU01", "target_user": "SPIDERMAN"}}

User: "Create a new sap user named ALICE"
{"intent": "sap", "output": {"action": "gui", "tcode": "SU01", "target_user": "ALICE"}}
