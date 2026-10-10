; Sudoku Master installer hooks (included by Tauri's NSIS template).

; Moving from the Electron-based 1.0.x: remove that app first but keep its saved
; data (--updated), so this version can import the player's progress on its
; first launch. This runs before shortcuts are created, because the old
; uninstaller deletes shortcuts with the same name.
!macro NSIS_HOOK_PREINSTALL
  ${If} ${FileExists} "$LOCALAPPDATA\Programs\sudoku-master-desktop\Uninstall Sudoku Master.exe"
    DetailPrint "Removing the previous version of Sudoku Master (your progress is kept)..."
    InitPluginsDir
    CopyFiles /SILENT "$LOCALAPPDATA\Programs\sudoku-master-desktop\Uninstall Sudoku Master.exe" "$PLUGINSDIR\old-uninstall.exe"
    ExecWait '"$PLUGINSDIR\old-uninstall.exe" /S --updated _?=$LOCALAPPDATA\Programs\sudoku-master-desktop'
    RMDir /r "$LOCALAPPDATA\Programs\sudoku-master-desktop"
  ${EndIf}
!macroend

; The 1.0.x app's update button runs this installer with --force-run:
; start the new app once it is installed.
!macro NSIS_HOOK_POSTINSTALL
  ClearErrors
  ${GetOptions} $CMDLINE "--force-run" $R9
  ${IfNot} ${Errors}
    nsis_tauri_utils::RunAsUser "$INSTDIR\${MAINBINARYNAME}.exe" ""
  ${EndIf}
!macroend

; "Delete the application data" also removes data left by the 1.0.x app.
!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $DeleteAppDataCheckboxState = 1
  ${AndIf} $UpdateMode <> 1
    RMDir /r "$APPDATA\Sudoku Master"
  ${EndIf}
!macroend
