// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(feature = "test-server")]
fn parse_http_server_port(arguments: &[String]) -> u16 {
    arguments
        .iter()
        .position(|argument| argument == "--port")
        .and_then(|index| arguments.get(index + 1))
        .and_then(|port_text| port_text.parse::<u16>().ok())
        .unwrap_or(3001)
}

#[cfg(all(feature = "desktop", feature = "test-server"))]
fn has_test_server_flag(arguments: &[String]) -> bool {
    arguments.iter().any(|argument| argument == "--test-server")
}

fn main() {
    #[cfg(all(feature = "desktop", feature = "test-server"))]
    {
        let arguments: Vec<String> = std::env::args().collect();
        if has_test_server_flag(&arguments) {
            let port = parse_http_server_port(&arguments);
            app_lib::run_http_server(port);
            return;
        }

        app_lib::run();
        return;
    }

    #[cfg(all(not(feature = "desktop"), feature = "test-server"))]
    {
        let arguments: Vec<String> = std::env::args().collect();
        let port = parse_http_server_port(&arguments);
        app_lib::run_http_server(port);
        return;
    }

    #[cfg(all(feature = "desktop", not(feature = "test-server")))]
    {
        app_lib::run();
        return;
    }

    #[cfg(all(not(feature = "desktop"), not(feature = "test-server")))]
    panic!("No runtime feature enabled. Enable `desktop` or `test-server`.");
}
