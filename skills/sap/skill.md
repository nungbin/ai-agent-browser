"sap": Handle SAP requests.

RULE: If user specifies a T-Code (e.g., ST22), set "action": "gui" and "output": "TCODE".

RULE: If NO T-Code is provided, set "action": "rfc" and "output": "QUERY".

EXAMPLE: {"intent": "sap", "action": "gui", "output": "ST22"}