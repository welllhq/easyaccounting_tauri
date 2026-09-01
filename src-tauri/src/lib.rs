mod commands;
mod db;

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::list_accounts,
            commands::create_account,
            commands::delete_account,
            commands::list_ledgers,
            commands::create_ledger,
            commands::delete_ledger,
            commands::list_records,
            commands::count_records,
            commands::all_records,
            commands::add_record,
            commands::update_record,
            commands::delete_record,
            commands::backup_db,
            commands::data_dir,
            commands::open_data_dir
        ])
        .run(tauri::generate_context!())
        .expect("轻账本启动失败");
}
