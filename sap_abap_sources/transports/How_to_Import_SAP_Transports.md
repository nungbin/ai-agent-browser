# **🚛 How to Import SAP Transport Requests (R & K Files)**

This guide explains how to manually import exported SAP Transport Requests back into an SAP system (like the NPL Developer Edition). This is highly useful for migrating custom ABAP code (like our AI RFC wrappers) between servers or restoring them after a system wipe.

## **📂 The Transport Naming Convention**

Before moving the files, it is important to understand SAP's naming convention.

Your files represent two Transport Requests:

* K900115.NPL & R900115.NPL \= Transport Request **NPLK900115** (Shortdumps)  
* K900117.NPL & R900117.NPL \= Transport Request **NPLK900117** (SLG1 Logs)

## **Step 1: Upload Files to the Linux OS**

You must place the files into the global SAP transport directory on your Linux server using WinSCP, FileZilla, or SFTP.

1. Connect to your SAP Linux server via SFTP as npladm (or root).  
2. Navigate to the /usr/sap/trans/ directory.  
3. Upload the **K files** to the cofiles folder:  
   * Upload K900115.NPL \-\> /usr/sap/trans/cofiles/  
   * Upload K900117.NPL \-\> /usr/sap/trans/cofiles/  
4. Upload the **R files** to the data folder:  
   * Upload R900115.NPL \-\> /usr/sap/trans/data/  
   * Upload R900117.NPL \-\> /usr/sap/trans/data/

## **Step 2: Fix File Permissions (Linux CLI)**

SAP is extremely strict about file permissions. If the SAP background processes cannot read the files, the import will fail.

SSH into your Linux server and run the following commands to ensure the npladm user and sapsys group own the files:

\# Switch to root or use sudo  
sudo chown npladm:sapsys /usr/sap/trans/cofiles/K900115.NPL  
sudo chown npladm:sapsys /usr/sap/trans/data/R900115.NPL  
sudo chown npladm:sapsys /usr/sap/trans/cofiles/K900117.NPL  
sudo chown npladm:sapsys /usr/sap/trans/data/R900117.NPL

\# Ensure read/write permissions  
sudo chmod 755 /usr/sap/trans/cofiles/K\*  
sudo chmod 755 /usr/sap/trans/data/R\*

## **Step 3: Add Transports to the STMS Buffer (SAP GUI)**

Now that the files are physically on the server, you must tell SAP to recognize them.

1. Log into your SAP GUI.  
2. Go to transaction **STMS** (Transport Management System).  
3. Click on the **Import Overview** button (the icon with a truck).  
4. Double-click on your target system's queue (e.g., **NPL**).  
5. On the top menu bar, click: **Extras \-\> Other Requests \-\> Add**.  
6. In the pop-up window, type in your first Transport Request name: **NPLK900115**.  
7. Hit **Enter** (or the green checkmark). Confirm "Yes" if it asks to attach it to the queue.  
8. Repeat steps 5-7 for the second transport: **NPLK900117**.

*You will now see both transports sitting in your import queue with a grey diamond status.*

## **Step 4: Import the Transports into the System**

1. Select both transports in the list (click and drag, or use F9).  
2. Click the **Import Request** button (the icon showing a truck with a small box, NOT the half-truck).  
3. A configuration pop-up will appear. Set the following options:  
   * **Target Client:** Enter your working client (e.g., 001).  
   * **Execution Tab:** Select *Immediate*.  
   * **Options Tab:** Check the following boxes (especially important for homelabs/overwrites):  
     * *Leave Transport Request in Queue for Later Import* (Optional)  
     * *Import Transport Request Again*  
     * *Overwrite Originals*  
     * *Overwrite Objects in Unconfirmed Repairs*  
     * *Ignore Invalid Component Version* (Crucial if moving between slightly different NetWeaver versions)  
4. Click the **Green Checkmark** to start the import.  
5. Click **Yes** to confirm.

## **Step 5: Verify the Import**

1. Click the **Refresh** button in STMS.  
2. The grey diamond will turn into a little truck icon while importing.  
3. Once finished, check the **RC (Return Code)** column:  
   * **RC \= 0 (Green):** Perfect success.  
   * **RC \= 4 (Yellow):** Completed with warnings (Usually fine, means a table was overwritten).  
   * **RC \= 8 (Red):** Error (Missing dictionary dependencies or syntax errors).

If you see a Green or Yellow status, your ABAP code and SE11 structures are fully active and ready for the Node.js Agent to use\!