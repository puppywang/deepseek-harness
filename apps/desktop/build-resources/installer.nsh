; Keep the assisted installer honest while the large Electron/runtime payload is
; being unpacked. NSIS recalculates its percentage bar for individual archive
; sections, so a determinate bar can move backwards even though installation is
; progressing normally. Use the native marquee mode instead.

!include LogicLib.nsh

!define DSH_PBS_MARQUEE 0x08
!define DSH_PBM_SETMARQUEE 0x40A

; ShowInstDetails/ShowUninstDetails are compile-time page settings, so they
; must be emitted from customHeader rather than from a runtime Function.
!macro customHeader
  !ifdef BUILD_UNINSTALLER
    ShowUninstDetails show
  !else
    ShowInstDetails show
  !endif
!macroend

!ifndef BUILD_UNINSTALLER
  ; electron-builder invokes this hook immediately before MUI_PAGE_INSTFILES.
  ; Installing the callback here gives us a reliable handle to the native
  ; progress control after the install page has been created.
  !macro customPageAfterChangeDir
    !define MUI_PAGE_CUSTOMFUNCTION_SHOW dshInstallPageShow
  !macroend

  Function dshInstallPageShow
    SetDetailsPrint both
    DetailPrint "DeepSeek Harness：正在开始安装..."
    DetailPrint "正在解压应用文件和运行时组件，请稍候。"

    ; MUI_INSTFILES uses control id 1004 for its progress bar. Convert the
    ; unreliable determinate bar to a native marquee while the archive is being
    ; extracted, so it never appears to go backwards.
    FindWindow $0 "#32770" "" $HWNDPARENT
    GetDlgItem $1 $0 1004
    ${If} $1 != 0
      System::Call 'user32::GetWindowLong(i r1, i -16) i.r2'
      IntOp $2 $2 | ${DSH_PBS_MARQUEE}
      System::Call 'user32::SetWindowLong(i r1, i -16, i r2) i'
      System::Call 'user32::SendMessage(i r1, i ${DSH_PBM_SETMARQUEE}, i 1, i 50) i'
    ${EndIf}
  FunctionEnd
!endif

!macro customInstall
  ; electron-builder suppresses file-by-file detail output during its large
  ; archive extraction. Re-enable it for the final native configuration steps
  ; so the details pane still explains what is happening at the end.
  SetDetailsPrint both
  DetailPrint "应用文件已解压。"
  DetailPrint "正在完成快捷方式和安装信息配置..."
  DetailPrint "安装即将完成。"

  FindWindow $0 "#32770" "" $HWNDPARENT
  GetDlgItem $1 $0 1004
  ${If} $1 != 0
    System::Call 'user32::SendMessage(i r1, i ${DSH_PBM_SETMARQUEE}, i 0, i 0) i'
  ${EndIf}
!macroend

!macro customUnInstall
  SetDetailsPrint both
  DetailPrint "DeepSeek Harness：正在删除应用文件..."
!macroend
