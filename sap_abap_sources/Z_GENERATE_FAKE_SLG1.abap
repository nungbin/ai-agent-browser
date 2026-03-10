REPORT z_generate_fake_slg1.

DATA: ls_log        TYPE bal_s_log,
      lv_log_handle TYPE balloghndl,
      lt_log_handle TYPE bal_t_logh,
      ls_msg        TYPE bal_s_msg.

" 1. Define the Log Header
ls_log-extnumber = 'AI_TEST_RUN_01'.
ls_log-object    = 'ZAGENT'.
ls_log-subobject = 'TEST'.
ls_log-aldate    = sy-datum.
ls_log-altime    = sy-uzeit.
ls_log-aluser    = sy-uname.
ls_log-alprog    = sy-repid.

" Create the log instance in memory
CALL FUNCTION 'BAL_LOG_CREATE'
  EXPORTING
    i_s_log      = ls_log
  IMPORTING
    e_log_handle = lv_log_handle
  EXCEPTIONS
    OTHERS       = 1.

IF sy-subrc <> 0.
  WRITE: / 'Error creating log instance.'.
  EXIT.
ENDIF.

" 2. Inject a Critical Error
CLEAR ls_msg.
ls_msg-msgty = 'E'.
ls_msg-msgid = '00'. " Standard SAP cross-application messages
ls_msg-msgno = '398'.
ls_msg-msgv1 = 'AI Integration Test:'.
ls_msg-msgv2 = 'Network timeout while'.
ls_msg-msgv3 = 'trying to sync Sales'.
ls_msg-msgv4 = 'Orders to the cloud!'.
ls_msg-probclass = '1'. " Very high probability

CALL FUNCTION 'BAL_LOG_MSG_ADD'
  EXPORTING
    i_log_handle = lv_log_handle
    i_s_msg      = ls_msg.

" 3. Inject a Warning
CLEAR ls_msg.
ls_msg-msgty = 'W'.
ls_msg-msgid = '00'. 
ls_msg-msgno = '398'.
ls_msg-msgv1 = 'AI Integration Test:'.
ls_msg-msgv2 = 'Node-RFC Memory usage'.
ls_msg-msgv3 = 'exceeded 85% limit.'.
ls_msg-probclass = '3'. 

CALL FUNCTION 'BAL_LOG_MSG_ADD'
  EXPORTING
    i_log_handle = lv_log_handle
    i_s_msg      = ls_msg.

" 4. Save the log memory to the actual SLG1 Database
APPEND lv_log_handle TO lt_log_handle.
CALL FUNCTION 'BAL_DB_SAVE'
  EXPORTING
    i_t_log_handle = lt_log_handle
  EXCEPTIONS
    OTHERS         = 1.

IF sy-subrc = 0.
  WRITE: / 'SUCCESS: Fake SLG1 Errors generated for ZAGENT / TEST!'.
  WRITE: / 'You can view them natively in t-code SLG1 now.'.
ELSE.
  WRITE: / 'CRITICAL: Failed to save to database.'.
ENDIF.
