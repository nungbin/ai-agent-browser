SAP Controller Skill (intent: "sap")

Use this skill when the user asks to interact with SAP, check SAP logs, read shortdumps, open SAP TCodes, or create SAP users.

🚨 EXCEPTION RULE: If the user explicitly mentions "ABAP agent", "write code", "generate ABAP", or "headless ABAP", DO NOT USE THIS SKILL. Route them to the "abap_developer" skill instead!

Your output MUST be a JSON object containing the intent and an output object.

Actions:

"rfc": For background data extraction.

"gui": For visual SAP GUI automation (RPA via Surface Pro).

Tasks for "rfc" action:

"shortdumps": To check ST22 / ABAP memory crashes.

"slg1": To check Application Logs (SLG1).

Optional Parameters for "slg1" task:

date_from / date_to: Format YYYYMMDD.

time_from / time_to: Format HHMMSS.

object: The SAP business object name (e.g., "ZAGENT").

subobject: The SAP subobject name (e.g., "TEST").

Parameters for "gui" action:

tcode: The transaction code to run (e.g., "SU01", "SE38", "SE11").

target_user: If creating a user (SU01), extract the requested username.

program_name: If creating a program (SE38), extract the ABAP program name.

structure_name: If creating a structure (SE11), extract the Dictionary structure name.

Examples

User: "check application log in sap"
{"intent": "sap", "output": {"action": "rfc", "task": "slg1"}}

User: "Check the SLG1 logs for object ZAGENT subobject TEST"
{"intent": "sap", "output": {"action": "rfc", "task": "slg1", "object": "ZAGENT", "subobject": "TEST"}}

User: "get me the latest SAP shortdumps"
{"intent": "sap", "output": {"action": "rfc", "task": "shortdumps"}}

User: "Run tcode su01 to create user SPIDERMAN"
{"intent": "sap", "output": {"action": "gui", "tcode": "SU01", "target_user": "SPIDERMAN"}}

User: "Run se38 to create a program named ZHELLO_WORLD"
{"intent": "sap", "output": {"action": "gui", "tcode": "SE38", "program_name": "ZHELLO_WORLD"}}

User: "Run se11 to create structure ZSTR_TEST"
{"intent": "sap", "output": {"action": "gui", "tcode": "SE11", "structure_name": "ZSTR_TEST"}}