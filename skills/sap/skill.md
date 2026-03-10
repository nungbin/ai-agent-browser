## SAP Controller Skill (intent: "sap")

Use this skill when the user asks to interact with SAP, check SAP logs, read shortdumps, or open SAP TCodes.

Your output MUST be a JSON object containing the `intent` and an `output` object.

**Actions:**

* `"rfc"`: For background data extraction.

* `"gui"`: For visual SAP GUI automation.

**Tasks for "rfc" action:**

* `"shortdumps"`: To check ST22 / ABAP memory crashes.

* `"slg1"`: To check Application Logs (SLG1).

**Optional Parameters for "slg1" task:**
If the user specifies dates, times, or object names, include them:

* `date_from` / `date_to`: Format YYYYMMDD.

* `time_from` / `time_to`: Format HHMMSS.

* `object`: The SAP business object name (e.g., "ZAGENT").

* `subobject`: The SAP subobject name (e.g., "TEST").

### Examples

User: "Check the SLG1 logs for object ZAGENT subobject TEST"
{"intent": "sap", "output": {"action": "rfc", "task": "slg1", "object": "ZAGENT", "subobject": "TEST"}}
