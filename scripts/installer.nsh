!macro customInstall
  DetailPrint "Registering PDFForge Viewer Explorer context menu..."
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\PDFForgeViewer" "" "Open Folder in PDFForge Viewer"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\PDFForgeViewer" "Icon" "$INSTDIR\PDFForge Viewer.exe"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\PDFForgeViewer\command" "" '"$INSTDIR\PDFForge Viewer.exe" "%V"'

  WriteRegStr HKCU "Software\Classes\Directory\shell\PDFForgeViewer" "" "Open Folder in PDFForge Viewer"
  WriteRegStr HKCU "Software\Classes\Directory\shell\PDFForgeViewer" "Icon" "$INSTDIR\PDFForge Viewer.exe"
  WriteRegStr HKCU "Software\Classes\Directory\shell\PDFForgeViewer\command" "" '"$INSTDIR\PDFForge Viewer.exe" "%1"'
!macroend

!macro customUnInstall
  DetailPrint "Unregistering PDFForge Viewer Explorer context menu..."
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\PDFForgeViewer"
  DeleteRegKey HKCU "Software\Classes\Directory\shell\PDFForgeViewer"
!macroend
