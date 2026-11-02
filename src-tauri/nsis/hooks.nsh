; Kait installer Ruangku (dipakai lewat bundle.windows.nsis.installerHooks).
;
; Versi awal Ruangku sempat dipasang lewat file .msi untuk semua pengguna
; (C:\Program Files\Ruangku). Bila salinan itu masih ada, salinan lama yang macet bisa
; memegang kunci "satu salinan" sehingga Ruangku yang baru tidak mau terbuka. Pemeriksaan
; aplikasi berjalan bawaan installer hanya melihat folder instalasi ini, jadi sebelum memasang
; kita cari salinan .msi itu dan menawarkan untuk mencopotnya. Data pengguna tidak tersentuh.
;
; Mode diam (/S) tidak pernah mencopot apa pun, kecuali diminta dengan /REMOVEMSI
; (untuk admin IT dan uji otomatis).

!macro NSIS_HOOK_PREINSTALL
  Push $0
  Push $1
  Push $2
  Push $3
  Push $4
  StrCpy $0 0
  StrCpy $4 "/passive"
  rk_msi_loop:
    ClearErrors
    EnumRegKey $1 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall" $0
    IfErrors rk_msi_done
    StrCmp $1 "" rk_msi_done
    IntOp $0 $0 + 1
    ReadRegStr $2 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\$1" "DisplayName"
    StrCmp $2 "${PRODUCTNAME}" 0 rk_msi_loop
    ReadRegDWORD $3 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\$1" "WindowsInstaller"
    StrCmp $3 "1" 0 rk_msi_loop
    ; Salinan .msi ditemukan; nama kunci $1 adalah ProductCode-nya.
    IfSilent 0 rk_msi_ask
      ClearErrors
      ${GetOptions} $CMDLINE "/REMOVEMSI" $3
      IfErrors rk_msi_done
      StrCpy $4 "/qn"
      Goto rk_msi_remove
    rk_msi_ask:
    StrCmp $PassiveMode 1 rk_msi_done
    MessageBox MB_YESNO|MB_ICONQUESTION "Ruangku versi lama yang dipasang lewat file .msi (untuk semua pengguna) masih ada di komputer ini. Dua salinan Ruangku bisa membuat aplikasi tidak mau terbuka.$\r$\n$\r$\nCopot versi lama itu sekarang? Windows akan meminta izin administrator. Data Anda tidak ikut terhapus." IDNO rk_msi_done
    rk_msi_remove:
    ; Tutup Ruangku yang mungkin tersangkut (termasuk salinan .msi), lalu copot salinan itu.
    nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM ${MAINBINARYNAME}.exe'
    Pop $3
    Sleep 800
    ExecWait '"$SYSDIR\msiexec.exe" /x $1 $4 /norestart' $3
    StrCmp $3 "0" rk_msi_done
    StrCmp $3 "3010" rk_msi_done
    MessageBox MB_OK|MB_ICONINFORMATION "Versi lama belum dicopot (kode $3). Anda bisa mencopotnya nanti dari Pengaturan Windows > Aplikasi > Aplikasi terinstal. Pemasangan dilanjutkan." /SD IDOK
  rk_msi_done:
  Pop $4
  Pop $3
  Pop $2
  Pop $1
  Pop $0
!macroend
