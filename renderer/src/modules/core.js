const path = require("path");
import LocaleManager from "./localemanager";

import Logger from "common/logger";
import {Config, Changelog} from "data";
import DOMManager from "./dommanager";
import PluginManager from "./pluginmanager";
import ThemeManager from "./thememanager";
import Settings from "./settingsmanager";
import * as Builtins from "builtins";
import Modals from "../ui/modals";
import ReactComponents from "./reactcomponents";
import DataStore from "./datastore";
import DiscordModules from "./discordmodules";
import ComponentPatcher from "./componentpatcher";
import Strings from "./strings";
import IPC from "./ipc";
import LoadingIcon from "../loadingicon";
import Styles from "../styles/index.css";

const GuildClasses = DiscordModules.GuildClasses;

export default new class Core {
    async startup() {
        if (this.hasStarted) return;
        this.hasStarted = true;

        // (() => {
        //     const fs = require("fs");
        //     fs.appendFileSync("Z:\\debug.log", "\n\n\n");

        //     const toFile = orig => (...args) => {
        //         fs.appendFileSync("Z:\\debug.log", JSON.stringify(args) + "\n");
        //         orig(...args);
        //     };

        //     window.ocl = console.log;
        //     window.oce = console.error;
        //     window.ocx = console.exception;
        //     console.log = toFile(window.ocl);
        //     console.error = toFile(window.oce);
        //     console.exception = toFile(window.ocx);
        // })();

        Config.appPath = process.env.DISCORD_APP_PATH;
        Config.userData = process.env.DISCORD_USER_DATA;
        Config.dataPath = process.env.BETTERDISCORD_DATA_PATH;

        // Load css early
        Logger.log("Startup", "Injecting BD Styles");
        DOMManager.injectStyle("bd-stylesheet", Styles.toString());

        Logger.log("Startup", "Initializing DataStore");
        DataStore.initialize();

        Logger.log("Startup", "Initializing LocaleManager");
        await LocaleManager.initialize();

        Logger.log("Startup", "Performing incompatibility checks");
        if (window.ED) return Modals.alert(Strings.Startup.notSupported, Strings.Startup.incompatibleApp.format({app: "EnhancedDiscord"}));
        if (window.WebSocket && window.WebSocket.name && window.WebSocket.name.includes("Patched")) return Modals.alert(Strings.Startup.notSupported, Strings.Startup.incompatibleApp.format({app: "Powercord"}));


        Logger.log("Startup", "Initializing Settings");
        Settings.initialize();

        Logger.log("Startup", "Initializing DOMManager");
        DOMManager.initialize();

        Logger.log("Startup", "Waiting for guilds...");
        await this.waitForGuilds();

        Logger.log("Startup", "Initializing ReactComponents");
        ReactComponents.initialize();

        Logger.log("Startup", "Initializing ComponentPatcher");
        ComponentPatcher.initialize();

        Logger.log("Startup", "Initializing Builtins");
        for (const module in Builtins) {
            if (module === "CustomCSS") await Builtins[module].initialize();
            else Builtins[module].initialize();
        }

        Logger.log("Startup", "Loading Plugins");
        // const pluginErrors = [];
        const pluginErrors = PluginManager.initialize();

        Logger.log("Startup", "Loading Themes");
        // const themeErrors = [];
        const themeErrors = ThemeManager.initialize();

        Logger.log("Startup", "Removing Loading Icon");
        LoadingIcon.hide();

        // Show loading errors
        Logger.log("Startup", "Collecting Startup Errors");
        Modals.showAddonErrors({plugins: pluginErrors, themes: themeErrors});

        const previousVersion = DataStore.getBDData("version");
        if (Config.version > previousVersion) {
            Modals.showChangelogModal(Changelog);
            DataStore.setBDData("version", Config.version);
        }

        this.checkForUpdate();
    }

    waitForGuilds() {
        let timesChecked = 0;
        return new Promise(resolve => {
            const checkForGuilds = function () {
                timesChecked++;
                if (document.readyState != "complete") setTimeout(checkForGuilds, 100);
                const wrapper = GuildClasses.wrapper.split(" ")[0];
                const guild = GuildClasses.listItem.split(" ")[0];
                const blob = GuildClasses.blobContainer.split(" ")[0];
                if (document.querySelectorAll(`.${wrapper} .${guild} .${blob}`).length > 0) return resolve();
                // else if (timesChecked >= 50) return resolve();
                setTimeout(checkForGuilds, 100);
            };

            checkForGuilds();
        });
    }

    async checkForUpdate() {
        const resp = await fetch(`https://api.github.com/repos/rauenzi/BetterDiscordApp/releases/latest`,{
            method: "GET",
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "User-Agent": "BetterDiscord Updater"
            }
        });

        const data = await resp.json();
        const remoteVersion = data.tag_name.startsWith("v") ? data.tag_name.slice(1) : data.tag_name;
        const hasUpdate = remoteVersion > Config.version;
        if (!hasUpdate) return;

        Modals.showConfirmationModal("Update", "There is an update, would you like to update now?", {
            confirmText: "Update",
            cancelText: "Skip",
            onConfirm: () => this.update(data)
        });
    }

    async update(releaseInfo) {
        try {
            const asar = releaseInfo.assets.find(a => a.name === "betterdiscord.asar");
            const request = require("request");
            const buff = await new Promise((resolve, reject) =>
                request(asar.url, {encoding: null, headers: {"User-Agent": "BD Updater", "Accept": "application/octet-stream"}}, (err, resp, body) => {
                if (err || resp.statusCode != 200) return reject(err || `${resp.statusCode} ${resp.statusMessage}`);
                return resolve(body);
            }));

            const asarPath = path.join(DataStore.baseFolder, "betterdiscord.asar");
            console.log(asarPath);
            const fs = require("original-fs");
            fs.writeFileSync(asarPath, buff);

            Modals.showConfirmationModal("Update Successful!", "BetterDiscord updated successfully. Discord needs to restart in order for it to take effect. Do you want to do this now?", {
                confirmText: Strings.Modals.restartNow,
                cancelText: Strings.Modals.restartLater,
                danger: true,
                onConfirm: () => IPC.relaunch()
            });
        }
        catch (err) {
            console.error(err);
            Modals.showConfirmationModal("Update Failed", "BetterDiscord failed to update. Please download the latest version of the installer from GitHub (https://github.com/BetterDiscord/Installer/releases/latest) and reinstall.", {
                cancelText: ""
            });
        }
    }
};