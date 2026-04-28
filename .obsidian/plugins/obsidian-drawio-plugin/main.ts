import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";
import {
	FileSystemAdapter,
	Menu,
	Notice,
	Plugin,
	setIcon,
	TFile,
} from "obsidian";

export default class DrawioPlugin extends Plugin {
	async onload() {
		this.addRibbonIcon(
			"drafting-compass",
			"New Diagram",
			async (evt: MouseEvent) => {
				try {
					const file = await this.createDiagram();
					const path = this.getAbsolutePath(file.path);

					if (!path) {
						new Notice(`Failed to get Draw.io file path.`);
						return;
					}

					this.openDiagram(path);
				} catch (err) {
					new Notice("Failed to create Draw.io diagram.");
				}
			}
		);

		this.registerEvent(
			this.app.workspace.on("file-menu", (menu: Menu, file: TFile) => {
				if (
					file.extension === "png" &&
					file.basename.endsWith(".drawio")
				) {
					menu.addItem((item) => {
						item.setTitle("Open in Draw.io")
							.setIcon("lucide-external-link")
							.onClick(() => {
								const path = this.getAbsolutePath(file.path);

								if (!path) {
									new Notice(
										`Failed to get Draw.io file path.`
									);
									return;
								}

								this.openDiagram(path);
							});
					});
				}
			})
		);

		this.registerMarkdownPostProcessor((el, ctx) => {
			const observer = new MutationObserver(() => {
				el.querySelectorAll("img").forEach((img: HTMLImageElement) => {
					const alt = img.getAttribute("alt");

					if (!alt?.endsWith(".drawio.png")) return;

					if (img.closest(".drawio-wrapper")) return;

					const wrapper = document.createElement("div");

					wrapper.classList.add("drawio-wrapper");
					wrapper.style.position = "relative";
					wrapper.style.display = "inline-block";

					const cloned = img.cloneNode(true);

					wrapper.appendChild(cloned);

					const icon = document.createElement("div");

					setIcon(icon, "external-link");

					icon.title = "Open in Draw.io";

					Object.assign(icon.style, {
						position: "absolute",
						top: "6px",
						right: "6px",
						cursor: "pointer",
						backgroundColor: "red",
						borderRadius: "4px",
						padding: "2px",
						width: "20px",
						height: "20px",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						boxShadow: "0 0 2px rgba(0,0,0,0.5)",
						zIndex: "1000",
					});

					wrapper.appendChild(icon);

					img.replaceWith(wrapper);

					icon.addEventListener("click", () => {
						const file = this.app.vault
							.getFiles()
							.find((f) => f.path === alt || f.name === alt);

						if (!file) {
							new Notice(`File not found: ${alt}`);
							return;
						}

						const path = this.getAbsolutePath(file.path);

						if (!path) {
							new Notice(`Failed to get Draw.io file path.`);
							return;
						}

						this.openDiagram(path);
					});
				});
			});

			observer.observe(el, { childList: true, subtree: true });
		});
	}

	private async createDiagram(): Promise<TFile> {
		const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
		const fileName = `diagram-${timestamp}.drawio.png`;

		const vaultRoot = (
			this.app.vault.adapter as FileSystemAdapter
		).getBasePath();

		const template = path.join(
			vaultRoot,
			".obsidian",
			"plugins",
			"obsidian-drawio-plugin",
			"template.drawio.png"
		);

		const buffer = fs.readFileSync(template);

		return await this.app.vault.createBinary(fileName, buffer);
	}

	private openDiagram(path: string): void {
		spawn("/Applications/draw.io.app/Contents/MacOS/draw.io", [path], {
			detached: true,
			stdio: "ignore",
		}).unref();
	}

	private getAbsolutePath(vaultRelativePath: string): string | undefined {
		const adapter = this.app.vault.adapter;

		if (adapter instanceof FileSystemAdapter) {
			return path.join(adapter.getBasePath(), vaultRelativePath);
		}

		return undefined;
	}
}
