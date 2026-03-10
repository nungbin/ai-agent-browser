# **🔌 SAP ABAP Backend Blueprint**

This folder contains the ABAP source code and Data Dictionary (SE11) blueprints required to enable the node-rfc connection for the Agent.

Because external applications cannot directly read deep memory structures (like standard SAP Shortdumps or Application Logs), we must create custom **RFC-Enabled Function Modules** in the SAP backend that format the data specifically for the AI.

## **🏗️ Required Dictionary Objects (SE11)**

Before activating the Function Modules, you must create the following Data Dictionary objects in transaction SE11.

### **1\. Shortdump Structure (ZSTR\_SHORTDUMP\_DATA)**

* **Type:** Structure  
* **Fields:** \* DATUM (SYDATUM)  
  * UZEIT (SYUZEIT)  
  * UNAME (SYUNAME)  
  * DUMP\_TEXT (STRING) \- *Must be STRING to prevent AI token cutoff.*

### **2\. SLG1 Log Structure (ZSTR\_SLG1\_DATA)**

* **Type:** Structure  
* **Fields:**  
  * LOGDATE (SYDATUM)  
  * LOGTIME (SYUZEIT)  
  * OBJECT (BALOBJ\_D)  
  * SUBOBJECT (BALSUBOBJ)  
  * MSGTY (SYMSGTY)  
  * MSGTEXT (STRING) \- *Deep structure for english message string.*

### **3\. SLG1 Table Type (ZTT\_SLG1\_DATA)**

* **Type:** Table Type  
* **Line Type:** ZSTR\_SLG1\_DATA  
* *Required because RFCs cannot use the TABLES tab for deep structures.*

## **🧩 Required Function Modules (SE37)**

Create these in a custom Function Group (e.g., Z\_AGENT\_RFC). Ensure the **"Remote-Enabled module"** radio button is checked in the Attributes tab\!

1. **Z\_GET\_LATEST\_DUMPS**: Extracts ST22 memory traces.  
2. **Z\_GET\_SLG1\_LOGS**: Wraps the standard APPL\_LOG\_READ\_DB API and parses the NW 7.5 TIME\_STMP field to extract and translate application logs.

*(See the .abap files in this directory for the raw source code).*

## **🧪 Testing utilities (SE38)**

* **Z\_GENERATE\_FAKE\_SLG1**: A utility program that injects artificial warnings and network timeout errors into the ZAGENT / TEST business object so you can test the AI's summarizing capabilities without having to break real production processes\!