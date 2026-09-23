# PowerShell script to notify Windows Explorer of file association / icon changes
$code = @"
using System;
using System.Runtime.InteropServices;
public class ShellNotifier {
    [DllImport("shell32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    public static extern void SHChangeNotify(uint wEventId, uint uFlags, IntPtr dwItem1, IntPtr dwItem2);
}
"@
try {
    Add-Type -TypeDefinition $code -ErrorAction Stop
    # 0x08000000 = SHCNE_ASSOCCHANGED
    [ShellNotifier]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)
    Write-Output "SHChangeNotify SUCCESS"
} catch {
    Write-Warning "Failed to call SHChangeNotify: $_"
}
