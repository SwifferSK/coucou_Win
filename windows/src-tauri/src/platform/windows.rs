// Windows: Win32 for the island window and the cursor, %APPDATA% for files.

use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::Command;

use serde::Serialize;
use tauri::{AppHandle, Manager, WebviewWindow};

use ::windows::core::{BOOL, PWSTR};
use ::windows::Win32::Foundation::{CloseHandle, HANDLE, HLOCAL, HWND, LPARAM, LocalFree, POINT};
use ::windows::Win32::Security::Authorization::ConvertSidToStringSidW;
use ::windows::Win32::Security::{GetTokenInformation, TokenUser, TOKEN_QUERY, TOKEN_USER};
use ::windows::Win32::System::Ole::RevokeDragDrop;
use ::windows::Win32::System::SystemInformation::GetLocalTime;
use ::windows::Win32::System::Threading::{
    GetCurrentProcess, OpenProcess, OpenProcessToken, PROCESS_QUERY_LIMITED_INFORMATION,
};
use ::windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON};
use ::windows::Win32::UI::WindowsAndMessaging::{
    EnumChildWindows, GetClassNameW, GetCursorPos, GetWindowLongPtrW, SetWindowLongPtrW,
    GWL_EXSTYLE, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW,
};

use super::LocalTime;
use crate::island::WINDOW_LABEL;

/// File name of the Claude Code relay.
pub const HOOK_EXE: &str = "coucou-hook.exe";

/// Environment variable holding the home directory.
pub const HOME_VAR: &str = "USERPROFILE";

/// Keeps spawned helpers from flashing a console window.
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

// ── Files ─────────────────────────────────────────────────────────────────────

/// %APPDATA%\Coucou — preferences.
pub fn config_dir() -> PathBuf {
    let base = std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."));
    base.join("Coucou")
}

/// %LOCALAPPDATA%\Coucou — where coucou-hook.exe, the inbox and the log live.
pub fn local_dir() -> PathBuf {
    let base = std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."));
    base.join("Coucou")
}

/// %APPDATA% and %LOCALAPPDATA% are already private to the user.
pub fn ensure_private_dir(dir: &std::path::Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dir)
}

/// Nothing to set up before the webview starts.
pub fn prepare_environment() {}

pub fn local_time() -> LocalTime {
    let t = unsafe { GetLocalTime() };
    LocalTime {
        year: t.wYear.into(),
        month: t.wMonth.into(),
        day: t.wDay.into(),
        hour: t.wHour.into(),
        minute: t.wMinute.into(),
        second: t.wSecond.into(),
    }
}

// ── Processes ─────────────────────────────────────────────────────────────────

/// Spawned helpers must never flash a console window.
pub fn no_console(cmd: &mut Command) -> &mut Command {
    cmd.creation_flags(CREATE_NO_WINDOW)
}

pub fn open_url(url: &str) {
    let _ = no_console(Command::new("rundll32.exe").args(["url.dll,FileProtocolHandler", url]))
        .spawn();
}

pub fn reveal_folder(path: &str) {
    let _ = Command::new("explorer").arg(path).spawn();
}

/// Our own `where`: walks %PATH% against %PATHEXT%, no shell involved.
/// Rust quotes arguments correctly for `.cmd`/`.bat` targets since 1.77, so
/// spawning `code.cmd` directly is safe.
pub fn find_on_path(stem: &str) -> Option<PathBuf> {
    let exts = std::env::var("PATHEXT").unwrap_or_else(|_| ".COM;.EXE;.BAT;.CMD".into());
    let dirs = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&dirs) {
        for ext in exts.split(';').filter(|e| !e.is_empty()) {
            let candidate = dir.join(format!("{stem}{}", ext.to_lowercase()));
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

// ── Who we are ────────────────────────────────────────────────────────────────
//
// Named pipes share one machine-wide namespace, so the SID in the name is what
// keeps two accounts on the same machine from ever meeting on `coucou-*`.
// coucou-hook computes the same string (hook/src/win.rs) and additionally checks
// that the process serving the pipe really is us.

/// The SID of the account this process runs as, as `S-1-5-21-…`.
pub fn current_user_sid() -> Option<String> {
    unsafe {
        let mut token = HANDLE::default();
        OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token).ok()?;

        // First call sizes the buffer, second fills it.
        let mut needed = 0u32;
        let _ = GetTokenInformation(token, TokenUser, None, 0, &mut needed);
        if needed == 0 {
            let _ = CloseHandle(token);
            return None;
        }
        let mut buf = vec![0u8; needed as usize];
        let ok = GetTokenInformation(
            token,
            TokenUser,
            Some(buf.as_mut_ptr().cast()),
            needed,
            &mut needed,
        )
        .is_ok();
        let _ = CloseHandle(token);
        if !ok {
            return None;
        }

        let user = &*(buf.as_ptr() as *const TOKEN_USER);
        let mut text = PWSTR::null();
        ConvertSidToStringSidW(user.User.Sid, &mut text).ok()?;
        let sid = text.to_string().ok();
        let _ = LocalFree(Some(HLOCAL(text.0 as *mut _)));
        sid
    }
}

// ── Cursor ────────────────────────────────────────────────────────────────────

/// The 60 Hz poll reads the cursor and flips click-through from it.
pub const CURSOR_POLL: bool = true;

/// Cursor position in physical screen pixels.
pub fn cursor_physical() -> Option<(f64, f64)> {
    let mut p = POINT::default();
    unsafe { GetCursorPos(&mut p).ok()? };
    Some((p.x as f64, p.y as f64))
}

/// True while the left mouse button is held — the only signal we get that a
/// drag might be in flight before it reaches the window.
pub fn left_button_down() -> bool {
    unsafe { (GetAsyncKeyState(VK_LBUTTON.0 as i32) as u16 & 0x8000) != 0 }
}

// ── Island window ─────────────────────────────────────────────────────────────

fn hwnd_of(win: &WebviewWindow) -> Option<HWND> {
    let raw = win.hwnd().ok()?.0 as isize;
    if raw == 0 {
        return None;
    }
    Some(HWND(raw as *mut _))
}

/// Lets dropped files reach the app again.
///
/// wry installs its drop target by walking the webview's child windows **once**,
/// when the webview is created. WebView2 creates `Chrome_RenderWidgetHostHWND`
/// later and registers its own target on it; being the innermost window, that one
/// wins, and since the page has no HTML5 drop handler it refuses everything — the
/// "no drop" cursor, with nothing reaching Tauri. Revoking it makes OLE fall
/// through to the target wry registered on the parent widget, which is the one
/// that feeds Tauri's drag events.
///
/// Cheap and idempotent, so it is simply re-run whenever a drag might be starting.
pub fn unblock_webview_drops(app: &AppHandle) {
    for label in [WINDOW_LABEL, "settings"] {
        let Some(win) = app.get_webview_window(label) else { continue };
        let Some(hwnd) = hwnd_of(&win) else { continue };
        unsafe {
            let _ = EnumChildWindows(Some(hwnd), Some(revoke_render_widget), LPARAM(0));
        }
    }
}

unsafe extern "system" fn revoke_render_widget(hwnd: HWND, _: LPARAM) -> BOOL {
    let mut name = [0u16; 64];
    let len = unsafe { GetClassNameW(hwnd, &mut name) };
    if len > 0 {
        let class = String::from_utf16_lossy(&name[..len as usize]);
        if class == "Chrome_RenderWidgetHostHWND" {
            let _ = unsafe { RevokeDragDrop(hwnd) };
        }
    }
    true.into()
}

/// WS_EX_NOACTIVATE keeps clicks from stealing focus; WS_EX_TOOLWINDOW keeps the
/// island out of Alt-Tab.
pub fn make_non_activating(win: &WebviewWindow) {
    let Some(hwnd) = hwnd_of(win) else { return };
    unsafe {
        let ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
        let want = ex | WS_EX_NOACTIVATE.0 as isize | WS_EX_TOOLWINDOW.0 as isize;
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, want);
    }
}

/// Temporarily allow activation so a text field inside the island can be typed in.
pub fn set_activating(win: &WebviewWindow, activating: bool) {
    let Some(hwnd) = hwnd_of(win) else { return };
    unsafe {
        let ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
        let want = if activating {
            ex & !(WS_EX_NOACTIVATE.0 as isize)
        } else {
            ex | WS_EX_NOACTIVATE.0 as isize
        };
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, want);
    }
}

/// Click-through here is the poll's WS_EX_TRANSPARENT toggle, not a region.
pub fn set_input_region(_win: &WebviewWindow, _rect: Option<(f64, f64, f64, f64)>) {}

// ── Spotify & Media Controls ──────────────────────────────────────────────────

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct SpotifyTrackInfo {
    pub running: bool,
    pub playing: bool,
    pub title: String,
    pub artist: String,
    pub raw: String,
}

pub fn get_spotify_track() -> Option<SpotifyTrackInfo> {
    use windows::Win32::UI::WindowsAndMessaging::{EnumWindows, GetWindowTextW, GetWindowThreadProcessId};

    struct State {
        info: Option<SpotifyTrackInfo>,
    }

    let mut state = State { info: None };

    unsafe extern "system" fn enum_win(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let state = &mut *(lparam.0 as *mut State);
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid == 0 {
            return true.into();
        }

        if let Ok(proc) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) {
            let mut name_buf = [0u16; 260];
            let mut size = name_buf.len() as u32;
            if windows::Win32::System::Threading::QueryFullProcessImageNameW(
                proc,
                windows::Win32::System::Threading::PROCESS_NAME_FORMAT(0),
                windows::core::PWSTR(name_buf.as_mut_ptr()),
                &mut size,
            ).is_ok() {
                let full_path = String::from_utf16_lossy(&name_buf[..size as usize]);
                if full_path.to_lowercase().ends_with("spotify.exe") {
                    let mut title_buf = [0u16; 512];
                    let len = GetWindowTextW(hwnd, &mut title_buf);
                    if len > 0 {
                        let text = String::from_utf16_lossy(&title_buf[..len as usize]);
                        if !text.is_empty() && text != "AngleHiddenWindow" && text != "MSCTFIME UI" && text != "Default IME" {
                            let (artist, title, playing) = if text.contains(" - ") {
                                let mut parts = text.splitn(2, " - ");
                                let a = parts.next().unwrap_or("").trim().to_string();
                                let t = parts.next().unwrap_or("").trim().to_string();
                                (a, t, true)
                            } else {
                                (String::new(), text.clone(), false)
                            };

                            let is_better = match &state.info {
                                None => true,
                                Some(existing) => !existing.playing && playing,
                            };

                            if is_better {
                                state.info = Some(SpotifyTrackInfo {
                                    running: true,
                                    playing,
                                    title,
                                    artist,
                                    raw: text,
                                });
                            }
                        }
                    }
                }
            }
            let _ = CloseHandle(proc);
        }
        true.into()
    }

    unsafe {
        let _ = EnumWindows(Some(enum_win), LPARAM(&mut state as *mut _ as isize));
    }

    state.info
}

pub fn media_control(action: &str) {
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        keybd_event, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP, VK_MEDIA_NEXT_TRACK, VK_MEDIA_PLAY_PAUSE,
        VK_MEDIA_PREV_TRACK,
    };
    let vk = match action {
        "play_pause" | "toggle" => VK_MEDIA_PLAY_PAUSE,
        "next" => VK_MEDIA_NEXT_TRACK,
        "prev" | "previous" => VK_MEDIA_PREV_TRACK,
        _ => return,
    };
    unsafe {
        keybd_event(vk.0 as u8, 0, KEYBD_EVENT_FLAGS(0), 0);
        keybd_event(vk.0 as u8, 0, KEYEVENTF_KEYUP, 0);
    }
}

// ── Window Context Capture ───────────────────────────────────────────────────

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct WindowContextInfo {
    pub app_name: String,
    pub title: String,
    pub url: Option<String>,
}

pub fn get_window_at_cursor(screen_x: i32, screen_y: i32) -> Option<WindowContextInfo> {
    use windows::Win32::UI::WindowsAndMessaging::{
        GetAncestor, GetWindowTextW, GetWindowThreadProcessId, WindowFromPoint, GA_ROOT,
    };

    let pt = POINT { x: screen_x, y: screen_y };
    unsafe {
        let hwnd_raw = WindowFromPoint(pt);
        if hwnd_raw.0.is_null() {
            return None;
        }
        let root_hwnd = GetAncestor(hwnd_raw, GA_ROOT);
        let hwnd = if !root_hwnd.0.is_null() { root_hwnd } else { hwnd_raw };

        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid == 0 {
            return None;
        }

        let mut title_buf = [0u16; 512];
        let len = GetWindowTextW(hwnd, &mut title_buf);
        let title = if len > 0 {
            String::from_utf16_lossy(&title_buf[..len as usize])
        } else {
            String::new()
        };

        let mut app_name = String::new();
        if let Ok(proc) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) {
            let mut name_buf = [0u16; 260];
            let mut size = name_buf.len() as u32;
            if windows::Win32::System::Threading::QueryFullProcessImageNameW(
                proc,
                windows::Win32::System::Threading::PROCESS_NAME_FORMAT(0),
                windows::core::PWSTR(name_buf.as_mut_ptr()),
                &mut size,
            ).is_ok() {
                let full_path = String::from_utf16_lossy(&name_buf[..size as usize]);
                if let Some(file_name) = std::path::Path::new(&full_path).file_name() {
                    app_name = file_name.to_string_lossy().to_string();
                    if app_name.to_lowercase().ends_with(".exe") {
                        app_name.truncate(app_name.len() - 4);
                    }
                }
            }
            let _ = CloseHandle(proc);
        }

        if app_name.is_empty() && title.is_empty() {
            return None;
        }

        Some(WindowContextInfo {
            app_name,
            title,
            url: None,
        })
    }
}


