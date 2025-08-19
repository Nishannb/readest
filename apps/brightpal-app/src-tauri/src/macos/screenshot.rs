use tauri::command;
use base64::Engine as _; // import trait for encode()

#[command]
pub async fn capture_screen_interactive() -> Result<(String, String), String> {
    // This uses macOS screencapture utility to let user select an area
    // Saves to a temp file, then returns (file_path, data_url). We no longer persist to Downloads by default.
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        use std::time::{SystemTime, UNIX_EPOCH};
        let ts = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis();
        let temp_dir = std::env::temp_dir();
        let file = format!(
            "{}/brightpal-screenshot-{}.png",
            temp_dir.display(),
            ts
        );
        // -i interactive, -s only selection, -o no shadow
        let status = Command::new("/usr/bin/env")
            .arg("screencapture")
            .arg("-i")
            .arg("-s")
            .arg("-o")
            .arg(&file)
            .status()
            .map_err(|e| format!("failed to run screencapture: {}", e))?;
        if !status.success() {
            return Ok((String::new(), String::new()));
        }
        let bytes = match std::fs::read(&file) {
            Ok(b) => b,
            Err(_) => return Ok((String::new(), String::new())),
        };
        let b64 = base64::engine::general_purpose::STANDARD.encode(bytes);
        let url = format!("data:image/png;base64,{}", b64);
        Ok((file, url))
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err("unsupported".into())
    }
}


