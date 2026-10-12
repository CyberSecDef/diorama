import type { AppMatch } from '../../theme';

/**
 * What each kind of prop opens. Desktop ids are tried first (GNOME, KDE,
 * XFCE, snaps), then freedesktop categories, so props work across distros.
 */
export const APPS = {
  terminal: '__terminal',
  calendar: { ids: ['org.gnome.Calendar', 'org.kde.korganizer', 'thunderbird_thunderbird'], categories: ['Calendar'] },
  clock: { ids: ['org.gnome.clocks', 'org.kde.kclock'], categories: ['Clock'] },
  calculator: { ids: ['org.gnome.Calculator', 'org.kde.kcalc', 'galculator', 'qalculate-gtk'], categories: ['Calculator'] },
  editor: { ids: ['org.gnome.TextEditor', 'org.gnome.gedit', 'org.kde.kate', 'mousepad', 'xed'], categories: ['TextEditor'] },
  code: { ids: ['code_code', 'code', 'codium', 'org.gnome.Builder'], categories: ['Development', 'IDE'] },
  files: { ids: ['org.gnome.Nautilus', 'org.kde.dolphin', 'thunar', 'nemo', 'pcmanfm'], categories: ['FileManager'] },
  browser: { ids: ['firefox_firefox', 'firefox', 'chromium_chromium', 'chromium', 'google-chrome', 'org.gnome.Epiphany'], categories: ['WebBrowser'] },
  email: { ids: ['thunderbird_thunderbird', 'thunderbird', 'org.gnome.Evolution', 'org.kde.kmail2', 'geary'], categories: ['Email'] },
  music: { ids: ['org.gnome.Rhythmbox3', 'org.gnome.Music', 'org.kde.elisa', 'spotify_spotify'], categories: ['Audio', 'Player'] },
  video: { ids: ['org.gnome.Showtime', 'org.gnome.Totem', 'vlc', 'mpv'], categories: ['Video', 'Player'] },
  photos: { ids: ['org.gnome.Shotwell', 'org.gnome.Loupe', 'org.gnome.eog', 'org.kde.gwenview'], categories: ['Photography'] },
  images: { ids: ['org.gnome.Loupe', 'org.gnome.eog', 'org.kde.gwenview', 'ristretto'], categories: ['Graphics', 'Viewer'] },
  camera: { ids: ['org.gnome.Snapshot', 'org.gnome.Cheese', 'org.kde.kamoso'], categories: ['Recorder'] },
  monitor: { ids: ['net.nokyan.Resources', 'org.gnome.SystemMonitor', 'gnome-system-monitor', 'org.kde.plasma-systemmonitor', 'tmog'], categories: ['Monitor'] },
  logs: { ids: ['org.gnome.Logs'], names: ['Logs'] },
  disks: { ids: ['org.gnome.DiskUtility', 'org.gnome.baobab'], names: ['Disks', 'Disk Usage'] },
  diskUsage: { ids: ['org.gnome.baobab', 'org.kde.filelight'], names: ['Disk Usage'] },
  docs: { ids: ['org.gnome.Papers', 'org.gnome.Evince', 'org.kde.okular'], categories: ['Office', 'Viewer'] },
  writer: { ids: ['libreoffice-writer', 'org.gnome.TextEditor'], categories: ['WordProcessor'] },
  spreadsheet: { ids: ['libreoffice-calc'], categories: ['Spreadsheet'] },
  slides: { ids: ['libreoffice-impress'], categories: ['Presentation'] },
  vm: { ids: ['virt-manager', 'org.gnome.Boxes', 'virtualbox'], categories: ['Emulator'] },
  remote: { ids: ['org.remmina.Remmina', 'org.gnome.Connections'], names: ['Remote'] },
  archive: { ids: ['org.gnome.FileRoller', 'org.kde.ark'], categories: ['Archiving'] },
  passwords: { ids: ['org.gnome.seahorse.Application', 'org.kde.kwalletmanager5'], names: ['Passwords'] },
  characters: { ids: ['org.gnome.Characters'], names: ['Characters'] },
  network: { ids: ['nm-connection-editor'], names: ['Network'] },
  software: { ids: ['snap-store_snap-store', 'org.gnome.Software', 'org.kde.discover'], categories: ['PackageManager'] },
  torrent: { ids: ['transmission-gtk', 'org.qbittorrent.qBittorrent'], categories: ['P2P'] },
} satisfies Record<string, AppMatch>;
