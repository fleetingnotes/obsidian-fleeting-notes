import {
	App,
	Notice,
	PluginSettingTab,
	Setting,
	TextAreaComponent,
} from "obsidian";
import FleetingNotesPlugin from "./main";
import { openInputModal } from "utils";
import SupabaseSync from "supabase_sync";

export interface FleetingNotesSettings {
	auto_generate_title: boolean;
	fleeting_notes_folder: string;
	note_template: string;
	sync_type: string;
	notes_filter: string;
	sync_on_startup: boolean;
	last_sync_time: Date;
  sync_obsidian_links: boolean;
  sync_obsidian_links_title: string;
	firebaseId: string | undefined;
	supabaseId: string | undefined;
  email: string | undefined;
  password: string | undefined;
	encryption_key: string;
	sync_interval: NodeJS.Timer | undefined;
}

export const DEFAULT_SETTINGS: FleetingNotesSettings = {
	auto_generate_title: false,
	fleeting_notes_folder: "FleetingNotesApp",
	note_template:
		'---\n# Mandatory field\nid: "${id}"\n# Optional fields\ntitle: "${title}"\ntags: ${tags}\nsource: "${source}"\ncreated_date: "${created_date}"\nmodified_date: "${last_modified_date}"\n---\n${content}',
	sync_on_startup: false,
	last_sync_time: new Date(0),
	sync_type: "one-way",
  sync_obsidian_links: false,
  sync_obsidian_links_title: "Links from Obsidian",
	notes_filter: "",
  email: undefined,
  password: undefined,
	firebaseId: undefined,
	supabaseId: undefined,
	encryption_key: "",
	sync_interval: undefined,
};
export class FleetingNotesSettingsTab extends PluginSettingTab {
	plugin: FleetingNotesPlugin;

	constructor(app: App, plugin: FleetingNotesPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}


	async manageAccount(btn: any) {
		if (this.plugin.isUserSignedIn()) {
      this.plugin.signOutUser();
			btn.setButtonText("Sign In").setCta();
			return;
		}
		openInputModal(
			"Login to Fleeting Notes",
			[
				{
					label: "Email",
					value: "email",
				},
				{
					label: "Password",
					value: "password",
          type: "password",
				},
			],
			"Login",
			async (result) => {
				const supaRes = await SupabaseSync.loginSupabase(
					result.email,
					result.password
				);
				const supaSuccess =
					supaRes === null || supaRes.error ? false : true;
				if (supaSuccess) {
					this.plugin.settings.firebaseId =
						supaRes.data.user.user_metadata.firebaseUid;
					this.plugin.settings.supabaseId = supaRes.data.user.id;
          this.plugin.settings.email = result.email;
          this.plugin.settings.password = result.password;
					btn.setButtonText("Sign Out").setCta();
				} else {
					new Notice(`Login failed - ${supaRes.error.message}`);
				}

				this.plugin.saveSettings();
			}
		);
	}

	display(): void {
		const { containerEl } = this;
		let noteTemplateComponent: TextAreaComponent;

		containerEl.empty();

		containerEl.createEl("h2", { text: "Authentication" });

		new Setting(containerEl)
			.setName("Account")
			.setDesc("Manage your Fleeting Notes Account")
			.addButton((btn: any) =>
				btn
					.setButtonText(
						this.plugin.settings.supabaseId ? "Sign Out" : "Sign In"
					)
					.setCta()
					.onClick(async () => await this.manageAccount(btn))
			);

		new Setting(containerEl)
			.setName("Encryption key")
			.setDesc("Encryption key used to encrypt notes")
			.addText((text) => {
				text.setPlaceholder("Enter encryption key")
					.setValue(this.plugin.settings.encryption_key)
					.onChange(async (value) => {
						this.plugin.settings.encryption_key = value;
						await this.plugin.saveSettings();
					});
				text.inputEl.type = "password";
			});

		containerEl.createEl("h2", { text: "Sync Settings" });

		new Setting(containerEl)
			.setName("Fleeting Notes folder location")
			.setDesc("Files will be populated here from Fleeting Notes")
			.addText((text) =>
				text
					.setPlaceholder("Enter the folder location")
					.setValue(this.plugin.settings.fleeting_notes_folder)
					.onChange(async (value) => {
						this.plugin.settings.fleeting_notes_folder = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Notes filter text")
			.setDesc(
				"Notes will only be imported if the title/content includes the text"
			)
			.addText((text) =>
				text
					.setPlaceholder("ex. #work")
					.setValue(this.plugin.settings.notes_filter)
					.onChange(async (value) => {
						this.plugin.settings.notes_filter = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Sync notes automatically")
			.setDesc("Sync will be performed on startup and every 30 minutes")
			.addToggle((tog) =>
				tog
					.setValue(this.plugin.settings.sync_on_startup)
					.onChange(async (val) => {
						this.plugin.settings.sync_on_startup = val;
						if (val) {
							this.plugin.autoSync();
						} else {
							this.plugin.disableAutoSync();
						}
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl).setName("Sync type:").addDropdown((dropdown) =>
			dropdown
				.addOption("one-way", "One-way sync (FN ⇒ Obsidian)")
				.addOption(
					"one-way-delete",
					"One-way sync (FN ⇒ Obsidian) + Delete from FN"
				)
				.addOption("two-way", "Two-way sync (FN ⇔ Obsidian)")
				.addOption("realtime-one-way", "Realtime One-way sync (FN ⇔ Obsidian)")
				.addOption("realtime-two-way", "Realtime Two-way sync (FN ⇔ Obsidian)")
				.setValue(this.plugin.settings.sync_type)
				.onChange(async (value) => {
					this.plugin.settings.sync_type = value;
          this.plugin.initRealtime(value);
					await this.plugin.saveSettings();
				})
		);

		new Setting(containerEl)
			.setName("Note Template")
			.setDesc("Only editable in one-way sync");
		new Setting(containerEl)
			.setHeading()
			.addTextArea((t) => {
				noteTemplateComponent = t;
				t.setValue(this.plugin.settings.note_template).onChange(
					async (val) => {
						this.plugin.settings.note_template = val;
						await this.plugin.saveSettings();
					}
				);
				t.inputEl.setAttr("rows", 10);
				t.inputEl.addClass("note_template");
				if (this.plugin.settings.sync_type == "two-way") {
					t.inputEl.setAttr("disabled", true);
				}
			})
			.addExtraButton((cb) => {
				cb.setIcon("sync")
					.setTooltip("Refresh template")
					.onClick(() => {
						this.plugin.settings.note_template =
							DEFAULT_SETTINGS.note_template;
						this.plugin.saveSettings();
						this.display();
					});
			});

		new Setting(containerEl)
			.setName("Auto-generate note title")
			.setDesc("Will generate based on note content")
			.addToggle((tog) =>
				tog
					.setValue(this.plugin.settings.auto_generate_title)
					.onChange(async (val) => {
						this.plugin.settings.auto_generate_title = val;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Sync Obsidian [[links]] to Fleeting Notes")
			.setDesc(`The note titled "${this.plugin.settings.sync_obsidian_links_title}" will be overwritten in the Fleeting Notes app`)
			.addToggle((tog) => {
				tog
					.setValue(this.plugin.settings.sync_obsidian_links)
					.onChange(async (val) => {
            if (val) {
              const ok = await this.plugin.syncObsidianLinks();
              if (ok) {
                this.plugin.settings.sync_obsidian_links = val;
                await this.plugin.saveSettings();
              }
            } else {
              this.plugin.settings.sync_obsidian_links = val;
              await this.plugin.saveSettings();
            }
					});
			});
	}
}
