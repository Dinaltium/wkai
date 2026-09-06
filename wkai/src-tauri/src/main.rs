// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(target_os = "windows")]
mod single_instance {
    use std::ffi::c_void;

    type HANDLE = *mut c_void;
    type BOOL = i32;
    type DWORD = u32;
    type LPCWSTR = *const u16;
    type HWND = *mut c_void;

    const ERROR_ALREADY_EXISTS: DWORD = 183;
    const SW_RESTORE: i32 = 9;
    const SW_SHOW: i32 = 5;

    extern "system" {
        fn CreateMutexW(
            lpMutexAttributes: *mut c_void,
            bInitialOwner: BOOL,
            lpName: LPCWSTR,
        ) -> HANDLE;
        fn GetLastError() -> DWORD;
        fn CloseHandle(hObject: HANDLE) -> BOOL;
        fn FindWindowW(lpClassName: LPCWSTR, lpWindowName: LPCWSTR) -> HWND;
        fn ShowWindow(hWnd: HWND, nCmdShow: i32) -> BOOL;
        fn SetForegroundWindow(hWnd: HWND) -> BOOL;
    }

    pub struct SingleInstanceGuard(Option<HANDLE>);

    impl SingleInstanceGuard {
        pub fn acquire(name: &str) -> Option<Self> {
            let wide_name: Vec<u16> = name.encode_utf16().chain(std::iter::once(0)).collect();
            unsafe {
                let handle = CreateMutexW(std::ptr::null_mut(), 1, wide_name.as_ptr());
                if handle.is_null() {
                    return None;
                }
                if GetLastError() == ERROR_ALREADY_EXISTS {
                    CloseHandle(handle);
                    return None;
                }
                Some(Self(Some(handle)))
            }
        }

        pub fn focus_existing_window() {
            let titles = ["WKAI Instructor — Workshop AI", "WKAI — Workshop AI"];
            for title in &titles {
                let wide_title: Vec<u16> = title.encode_utf16().chain(std::iter::once(0)).collect();
                unsafe {
                    let hwnd = FindWindowW(std::ptr::null(), wide_title.as_ptr());
                    if !hwnd.is_null() {
                        ShowWindow(hwnd, SW_RESTORE);
                        ShowWindow(hwnd, SW_SHOW);
                        SetForegroundWindow(hwnd);
                        return;
                    }
                }
            }
        }
    }

    impl Drop for SingleInstanceGuard {
        fn drop(&mut self) {
            if let Some(h) = self.0.take() {
                unsafe {
                    CloseHandle(h);
                }
            }
        }
    }
}

fn main() {
    #[cfg(target_os = "windows")]
    {
        // Intercept second instance before Tauri/WebView2 initialization so
        // WebView2 never hits HRESULT 0x800700AA (resource in use) on the user data folder.
        let guard = single_instance::SingleInstanceGuard::acquire("WKAI_Instructor_SingleInstance_Mutex");
        if guard.is_none() {
            single_instance::SingleInstanceGuard::focus_existing_window();
            return;
        }
        let _guard = guard;
        wkai_instructor_lib::run();
        return;
    }

    #[cfg(not(target_os = "windows"))]
    wkai_instructor_lib::run();
}
