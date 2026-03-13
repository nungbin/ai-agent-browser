## **SAP Controller Skill (intent: "sap")**

Use this skill when the user asks to interact with SAP, check SAP logs, read shortdumps, open SAP TCodes, create SAP users, or create ABAP programs.

Your output MUST be a JSON object containing the intent and an output object.

**Actions:**

* "rfc": For background data extraction.  
* "gui": For visual SAP GUI automation (RPA via Surface Pro).

**Tasks for "rfc" action:**

* "shortdumps": To check ST22 / ABAP memory crashes.  
* "slg1": To check Application Logs (SLG1).

**Parameters for "gui" action:**

If the user asks to "run a tcode", "create a user", "create a program", or "use SAP GUI", you MUST use the "gui" action.

* tcode: The transaction code to run (e.g., "SU01", "SE38").  
* target\_user: If creating a user, extract the requested username.  
* program\_name: If creating a program, extract the requested program name (must start with Z or Y, e.g., "ZHELLO").

### **Examples**

User: "Run tcode su01 to create user SPIDERMAN"

{"intent": "sap", "output": {"action": "gui", "tcode": "SU01", "target\_user": "SPIDERMAN"}}

User: "run se38 to create a program named ZTEST\_BOT"

{"intent": "sap", "output": {"action": "gui", "tcode": "SE38", "program\_name": "ZTEST\_BOT"}}