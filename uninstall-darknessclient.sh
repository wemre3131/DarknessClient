#!/bin/sh
set -eu

die() {
    echo "$1" >&2
    exit 1
}

echo ""
echo "DarknessClient Uninstaller"
echo "=========================="

installs=""

add_install() {
    label=$1
    backup=$2
    if [ -f "$backup" ]; then
        app=$(dirname "$backup")/app.asar
        installs="$installs$label|$app|$backup
"
    fi
}

for bundle in \
    "/Applications/Discord.app" \
    "/Applications/Discord Canary.app" \
    "/Applications/Discord PTB.app" \
    "/Applications/Discord Development.app" \
    "$HOME/Applications/Discord.app" \
    "$HOME/Applications/Discord Canary.app" \
    "$HOME/Applications/Discord PTB.app" \
    "$HOME/Applications/Discord Development.app"
do
    add_install "$(basename "$bundle") (macOS)" "$bundle/Contents/Resources/_app.asar"
done

for dir in \
    "$HOME/.config"/discord*/app-* \
    "$HOME/.config"/discordcanary*/app-* \
    "$HOME/.config"/discordptb*/app-* \
    "$HOME/.config"/discorddevelopment*/app-*
do
    [ -f "$dir/resources/_app.asar" ] || continue
    parent=$(basename "$(dirname "$dir")")
    version=$(basename "$dir")
    add_install "$parent [$version] (Linux)" "$dir/resources/_app.asar"
done

for dir in \
    /usr/share/discord \
    /usr/share/discord-canary \
    /usr/share/discord-ptb \
    /opt/discord \
    /opt/discordcanary \
    /opt/discord-ptb
do
    add_install "$(basename "$dir") (Linux)" "$dir/resources/_app.asar"
done

for dir in \
    "$HOME/.var/app"/com.discordapp.Discord*/files/Discord \
    /var/lib/flatpak/app/com.discordapp.Discord*/current/active/files/Discord
do
    [ -f "$dir/resources/_app.asar" ] || continue
    add_install "Discord Flatpak [$(basename "$dir")]" "$dir/resources/_app.asar"
done

for dir in /snap/discord/current /snap/discord-canary/current
do
    add_install "Discord Snap" "$dir/resources/_app.asar"
    add_install "Discord Snap" "$dir/usr/share/discord/resources/_app.asar"
done

count=$(printf '%s\n' "$installs" | awk 'NF { n++ } END { print n + 0 }')
if [ "$count" -eq 0 ]; then
    echo "No patched Discord install found." >&2
    exit 1
fi

echo ""
echo "Select the Discord install to unpatch:"
printf '%s\n' "$installs" | awk -F'|' 'NF { printf "  [%d] %s\n", ++n, $1 }'
echo ""

printf 'Enter number (q to quit): '
IFS= read -r answer || exit 0
case "$answer" in
    q|Q) exit 0 ;;
esac
case "$answer" in
    ''|*[!0-9]*) die "Invalid selection." ;;
esac
if [ "$answer" -lt 1 ] || [ "$answer" -gt "$count" ]; then
    die "Invalid selection."
fi

app=$(printf '%s\n' "$installs" | awk -F'|' -v n="$answer" 'NF && ++i == n { print $2 }')
backup=$(printf '%s\n' "$installs" | awk -F'|' -v n="$answer" 'NF && ++i == n { print $3 }')
[ -n "$app" ] && [ -n "$backup" ] || die "Could not resolve that install."

if command -v pgrep >/dev/null 2>&1; then
    running=$(pgrep -f 'Discord(Canary|PTB|Development)?' || true)
    if [ -n "$running" ]; then
        echo "Discord is currently running."
        printf 'Close all Discord processes now? [Y/n] '
        IFS= read -r close || close=n
        case "$close" in
            ''|y|Y|yes|YES)
                for pid in $running; do kill "$pid" 2>/dev/null || true; done
                sleep 1
                for pid in $running; do kill -9 "$pid" 2>/dev/null || true; done
                ;;
            *)
                die "Aborted. Close Discord and run the uninstaller again."
                ;;
        esac
    fi
fi

resources=$(dirname "$app")
sudo_cmd=""
if [ ! -w "$resources" ]; then
    if command -v sudo >/dev/null 2>&1; then
        echo "This install needs administrator rights. You may be prompted for your password."
        sudo_cmd=sudo
    else
        die "Cannot write to $resources and sudo is unavailable."
    fi
fi

backup_size=$(wc -c < "$backup" | tr -d ' ')
if [ "$backup_size" -lt 1048576 ]; then
    echo "Warning: _app.asar looks unusually small; the install may be broken."
fi

$sudo_cmd chmod u+w "$app" "$backup" 2>/dev/null || true
$sudo_cmd cp -f "$backup" "$app"
$sudo_cmd rm -f "$backup"

echo ""
echo "DarknessClient patch removed."

case "$(uname -s)" in
    Darwin) settings="$HOME/Library/Application Support/DarknessClient" ;;
    *) settings="$HOME/.config/DarknessClient" ;;
esac
if [ -d "$settings" ]; then
    printf 'Delete DarknessClient settings too? [y/N] '
    IFS= read -r remove || remove=n
    case "$remove" in
        y|Y|yes|YES)
            rm -rf "$settings"
            echo "Removed $settings"
            ;;
    esac
fi

printf 'Launch Discord now? [Y/n] '
IFS= read -r launch || launch=n
case "$launch" in
    ''|y|Y|yes|YES)
        case "$app" in
            *.app/Contents/Resources/app.asar)
                bundle=$(printf '%s' "$app" | sed 's#/Contents/Resources/app\.asar$##')
                if command -v open >/dev/null 2>&1; then
                    open "$bundle" >/dev/null 2>&1 &
                fi
                ;;
            *)
                root=$(dirname "$resources")
                for exe in \
                    "$root/Discord" \
                    "$root/discord" \
                    "$root/DiscordCanary" \
                    "$root/discord-canary" \
                    /usr/bin/discord \
                    /usr/bin/discord-canary \
                    /usr/bin/discord-ptb
                do
                    if [ -x "$exe" ]; then
                        "$exe" >/dev/null 2>&1 &
                        break
                    fi
                done
                ;;
        esac
        ;;
esac

exit 0
