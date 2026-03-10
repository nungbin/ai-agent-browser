FUNCTION Z_GET_SLG1_LOGS.
*"----------------------------------------------------------------------
*"*"Local Interface:
*"  IMPORTING
*"     VALUE(IV_OBJECT) TYPE  BALOBJ_D OPTIONAL
*"     VALUE(IV_SUBOBJECT) TYPE  BALSUBOBJ OPTIONAL
*"     VALUE(IV_DATE_FROM) TYPE  SY-DATUM DEFAULT SY-DATUM
*"     VALUE(IV_DATE_TO) TYPE  SY-DATUM DEFAULT SY-DATUM
*"     VALUE(IV_TIME_FROM) TYPE  SY-UZEIT DEFAULT '000000'
*"     VALUE(IV_TIME_TO) TYPE  SY-UZEIT DEFAULT '235959'
*"     VALUE(IV_ONLY_ERRORS) TYPE  FLAG DEFAULT 'X'
*"  EXPORTING
*"     VALUE(ET_LOGS) TYPE  ZTT_SLG1_DATA
*"----------------------------------------------------------------------

  DATA: lt_header   TYPE TABLE OF balhdr,
        lt_messages TYPE TABLE OF balm,
        ls_message  TYPE balm,
        ls_log_out  TYPE ZSTR_SLG1_DATA.

  " 1. Call standard SAP API (Corrected Parameter Mapping)
  CALL FUNCTION 'APPL_LOG_READ_DB'
    EXPORTING
      object          = iv_object
      subobject       = iv_subobject
      date_from       = iv_date_from
      time_from       = iv_time_from
      date_to         = iv_date_to
      time_to         = iv_time_to
    TABLES
      header_data     = lt_header
      messages        = lt_messages
    EXCEPTIONS
      no_logs_found   = 1
      OTHERS          = 2.

  IF sy-subrc <> 0.
    RETURN. " No logs found
  ENDIF.

  " 2. Format messages for AI
  LOOP AT lt_messages INTO ls_message.
    
    " Skip Info/Success messages if we only want Errors
    IF iv_only_errors = 'X' AND ls_message-msgty CA 'SI'.
      CONTINUE. 
    ENDIF.

    CLEAR ls_log_out.
    ls_log_out-msgty = ls_message-msgty.

    " Convert the precise NW 7.5 decimal timestamp into readable Date/Time
    IF ls_message-time_stmp IS NOT INITIAL.
      CONVERT TIME STAMP ls_message-time_stmp TIME ZONE sy-zonlo
        INTO DATE ls_log_out-logdate TIME ls_log_out-logtime.
    ENDIF.

    " Find Header for Object mapping
    READ TABLE lt_header INTO DATA(ls_hdr) WITH KEY lognumber = ls_message-lognumber.
    IF sy-subrc = 0.
      ls_log_out-object    = ls_hdr-object.
      ls_log_out-subobject = ls_hdr-subobject.
      
      IF ls_log_out-logdate IS INITIAL.
        ls_log_out-logdate = ls_hdr-aldate.
        ls_log_out-logtime = ls_hdr-altime.
      ENDIF.
    ENDIF.

    " 3. Translate Message ID to English String
    MESSAGE ID ls_message-msgid TYPE ls_message-msgty NUMBER ls_message-msgno
      WITH ls_message-msgv1 ls_message-msgv2 ls_message-msgv3 ls_message-msgv4
      INTO ls_log_out-msgtext.

    APPEND ls_log_out TO et_logs.
  ENDLOOP.

ENDFUNCTION.
