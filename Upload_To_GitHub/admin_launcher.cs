using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

namespace PsDownloadAdminLauncher
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            try
            {
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                string electronPath = Path.Combine(baseDir, "node_modules", "electron", "dist", "electron.exe");
                string adminScript = Path.Combine(baseDir, "admin_main.js");

                if (!File.Exists(electronPath))
                {
                    // Fallback to parent directory if placed in subfolder
                    DirectoryInfo parent = Directory.GetParent(baseDir);
                    string parentDir = (parent != null) ? parent.FullName : baseDir;
                    string cand = Path.Combine(parentDir, "node_modules", "electron", "dist", "electron.exe");
                    if (File.Exists(cand))
                    {
                        electronPath = cand;
                        baseDir = parentDir;
                        adminScript = Path.Combine(baseDir, "admin_main.js");
                    }
                }

                if (!File.Exists(electronPath))
                {
                    MessageBox.Show(
                        "រកមិនឃើញ Electron Engine ឡើយ!\n" + electronPath,
                        "PS DOWNLOAD - Admin Error",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error
                    );
                    return;
                }

                if (!File.Exists(adminScript))
                {
                    MessageBox.Show(
                        "រកមិនឃើញ admin_main.js ឡើយ!\n" + adminScript,
                        "PS DOWNLOAD - Admin Error",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error
                    );
                    return;
                }

                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = electronPath,
                    Arguments = "\"" + adminScript + "\"",
                    WorkingDirectory = baseDir,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    WindowStyle = ProcessWindowStyle.Hidden
                };

                Process.Start(psi);
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    "Error launching Admin Keygen:\n" + ex.Message,
                    "PS DOWNLOAD - Launch Error",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
            }
        }
    }
}
