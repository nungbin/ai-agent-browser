FUNCTION Z_GET_LATEST_DUMPS.
*"----------------------------------------------------------------------
*"*"Local Interface:
*"  IMPORTING
*"     VALUE(IV_DATE_FROM) TYPE  SY-DATUM DEFAULT SY-DATUM
*"     VALUE(IV_DATE_TO) TYPE  SY-DATUM DEFAULT SY-DATUM
*"  TABLES
*"      ET_DUMPS STRUCTURE  ZSTR_SHORTDUMP_DATA
*"----------------------------------------------------------------------
  " Reads the ABAP Shortdump headers and text for AI Analysis
  
  DATA: lt_snap TYPE TABLE OF snap,
        ls_snap TYPE snap,
        ls_dump TYPE ZSTR_SHORTDUMP_DATA.

  " 1. Get the dump headers
  SELECT * FROM snap INTO TABLE lt_snap
    WHERE datum >= iv_date_from
      AND datum <= iv_date_to
      AND seqno = '000'. " Header record

  " 2. Format and get the text for each dump
  LOOP AT lt_snap INTO ls_snap.
    CLEAR ls_dump.
    ls_dump-datum = ls_snap-datum.
    ls_dump-uzeit = ls_snap-uzeit.
    ls_dump-uname = ls_snap-uname.
    
    " Extract actual crash text from SNAPT or SNAP body here
    " (Truncated for AI memory limits)
    ls_dump-dump_text = ls_snap-flinfo. 

    APPEND ls_dump TO et_dumps.
  ENDLOOP.

ENDFUNCTION.
