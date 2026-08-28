#!/bin/sh
#
# load-plugins.sh — unified launcher for the plugin/nop-* family (M3-WI7,
# plan docs/plans/multi-plugin-dsh/2026-08-28-0149-3; design owner
# docs/design/multi-plugin-dsh-architecture.md §Load Script / §Plugin Manifest).
#
# Reads plugin/plugin-manifest.yml (schema:1) and mounts every declared
# plugin into a DSH profile, in manifest order, idempotently.
#
# YAML syntax validation — dual degradation, python3 first (design ruling):
#   1. python3 with PyYAML: probe `python3 -c 'import yaml'`; on success
#      validate via `python3 -c 'import sys,yaml; yaml.safe_load(...)'`.
#   2. python3 or PyYAML absent → node channel through the nop-age bundle's
#      pinned devDep `yaml` (plugin/nop-age/node_modules/yaml, installed by
#      the repo's L2 gate): `(cd plugin/nop-age && node -e 'require("yaml")...')`
#      so `require` resolves inside the bundle. If that devDep is missing,
#      run `npm ci --prefix plugin/nop-age` first.
#   Validation only — mounting itself needs neither Python nor Node.
#
# Pre-flight assertions (fail-fast, before any dsh call):
#   - unknown top-level manifest keys rejected (whitelist schema/profile/plugins)
#   - ${VAR} placeholders: defined env var → substituted; undefined → error
#     exit (never silently empty)
#   - every entry path must exist and contain a cordis.patch.yml
#
# Field extraction is a line-based reader for the canonical schema:1 shape
# (2-space indents, `- name:` first on the entry dash line, config
# sub-blocks deeper). The syntax validation above guarantees real YAML; the
# reader only needs that canonical subset.
#
# POSIX sh only — no bashisms (no [[ ]], no arrays, no `local`, no `function`
# keyword, no bash-only parameter expansions). External tools: grep, sed.
#
# shellcheck disable=SC2016
# ^ single-quoted '${' patterns are deliberate: the script must match the
#   literal placeholder syntax, never expand it at script-parse time.
#
# Exit codes: 0 = full success (or clean dry-run / unmount); non-zero =
# any failure (pre-flight denial, mount/unmount failure; --strict makes the
# first failure abort immediately).

set -u

PROG=load-plugins.sh

die() {
  printf '%s: error: %s\n' "$PROG" "$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
usage: load-plugins.sh [--profile <name>] [--manifest <path>] [--no-start]
                       [--dry-run] [--strict] [--skip <name>]... [--unmount-all]

  --profile <name>    override the manifest profile: value
  --manifest <path>   manifest path (default: <script-dir>/plugin-manifest.yml)
  --no-start          mount only; do not start the DSH host
  --dry-run           print the planned `dsh plugin add` commands, execute nothing
  --strict            abort on the first failure (default: continue, exit non-zero)
  --skip <name>       skip a plugin by manifest name (repeatable)
  --unmount-all       remove every manifest entry from the profile, then exit

${VAR} placeholders in the manifest are substituted from the environment;
an undefined variable is a pre-flight error. Typical usage exports
PROJECT_ROOT=<repo root> first (the nop-age supervisor.projectRoot placeholder).
EOF
}

# ── locate self (no dirname dependency) ────────────────────────────────
case $0 in
  */*) SCRIPT_DIR=${0%/*} ;;
  *)
    SCRIPT_DIR=$(command -v "$0" 2>/dev/null) || SCRIPT_DIR=$0
    SCRIPT_DIR=${SCRIPT_DIR%/*}
    ;;
esac
case $SCRIPT_DIR in
  /*) ;;
  *) SCRIPT_DIR=$PWD/$SCRIPT_DIR ;;
esac
SCRIPT_DIR=$(printf '%s' "$SCRIPT_DIR" | sed 's|/\./|/|g')

# ── flags ──────────────────────────────────────────────────────────────
PROFILE_FLAG=''
MANIFEST_FLAG=''
NO_START=0
DRY_RUN=0
STRICT=0
UNMOUNT_ALL=0
SKIP_NAMES=''

while [ $# -gt 0 ]; do
  case $1 in
    --profile)
      [ $# -ge 2 ] || die '--profile requires a value'
      PROFILE_FLAG=$2
      shift 2
      ;;
    --manifest)
      [ $# -ge 2 ] || die '--manifest requires a value'
      MANIFEST_FLAG=$2
      shift 2
      ;;
    --no-start) NO_START=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    --strict) STRICT=1; shift ;;
    --skip)
      [ $# -ge 2 ] || die '--skip requires a value'
      SKIP_NAMES="$SKIP_NAMES $2"
      shift 2
      ;;
    --unmount-all) UNMOUNT_ALL=1; shift ;;
    -h | --help) usage; exit 0 ;;
    *) die "unknown flag: $1 (see --help)" ;;
  esac
done

# ── manifest resolution (absolute; entry paths resolve against its dir) ─
if [ -n "$MANIFEST_FLAG" ]; then
  MANIFEST=$MANIFEST_FLAG
else
  MANIFEST=$SCRIPT_DIR/plugin-manifest.yml
fi
case $MANIFEST in
  /*) ;;
  *) MANIFEST=$PWD/$MANIFEST ;;
esac
MANIFEST=$(printf '%s' "$MANIFEST" | sed 's|/\./|/|g')
[ -f "$MANIFEST" ] || die "manifest not found: $MANIFEST"
MANIFEST_DIR=${MANIFEST%/*}

# ── YAML syntax validation (dual degradation, python3 preferred) ───────
validate_yaml() {
  if command -v python3 >/dev/null 2>&1 && python3 -c 'import yaml' >/dev/null 2>&1; then
    python3 -c 'import sys, yaml; yaml.safe_load(open(sys.argv[1]))' "$MANIFEST" \
      || die "manifest is not valid YAML: $MANIFEST (python3/PyYAML channel)"
  elif command -v node >/dev/null 2>&1; then
    (
      cd "$SCRIPT_DIR/nop-age" || exit 1
      exec node -e 'const fs = require("fs"); const yaml = require("yaml");
                    yaml.parse(fs.readFileSync(process.argv[1], "utf8"))' "$MANIFEST"
    ) || die "manifest is not valid YAML: $MANIFEST (node channel via plugin/nop-age devDep yaml — if that devDep is missing run: npm ci --prefix plugin/nop-age)"
  else
    die 'no YAML validator available: need python3 with PyYAML, or node with plugin/nop-age devDeps installed'
  fi
}

# ── pre-flight: unknown top-level keys rejected ────────────────────────
check_top_level_keys() {
  while IFS= read -r _key; do
    [ -n "$_key" ] || continue
    case $_key in
      schema | profile | plugins) ;;
      *) die "unknown top-level manifest key: $_key (allowed: schema, profile, plugins)" ;;
    esac
  done <<EOF
$(sed -n 's/^\([A-Za-z_][A-Za-z0-9_-]*\):.*/\1/p' "$MANIFEST")
EOF
}

# ── pre-flight: every ${VAR} in the manifest must be defined ───────────
# Comment lines are ignored — only live YAML values carry the semantics.
check_placeholders_defined() {
  # shellcheck disable=SC2046
  # ^ intentional word splitting: every ${VAR} token is one whitespace-free word
  set -- $(sed '/^[[:space:]]*#/d' "$MANIFEST" | grep -o '${[A-Za-z_][A-Za-z0-9_]*}')
  for _tok do
    _pname=${_tok#'${'}
    _pname=${_pname%'}'}
    eval "[ -n \"\${$_pname+set}\" ]" \
      || die "manifest references undefined variable $_tok (define it in the environment)"
  done
}

# ── ${VAR} substitution for values (definedness already enforced) ──────
# Sets SUBST_RESULT; dies on a malformed placeholder.
subst_vars() {
  _sv_in=$1
  _sv_out=''
  while :; do
    case $_sv_in in
      *'${'*)
        _sv_out=${_sv_out}${_sv_in%%'${'*}
        _sv_rest=${_sv_in#*'${'}
        _sv_name=${_sv_rest%%'}'*}
        case $_sv_name in
          '' | *[!A-Za-z0-9_]*)
            die "invalid \${...} placeholder in manifest value: '\${$_sv_name'"
            ;;
        esac
        _sv_val=''
        eval "_sv_val=\"\${$_sv_name}\""
        _sv_out=${_sv_out}$_sv_val
        _sv_in=${_sv_rest#*'}'}
        ;;
      *)
        _sv_out=${_sv_out}${_sv_in}
        break
        ;;
    esac
  done
  SUBST_RESULT=$_sv_out
}

# ── canonical schema:1 field reader ────────────────────────────────────
# Sets MANIFEST_PROFILE (raw value) and PLUGIN_ENTRIES (one "name|rawpath"
# row per line, manifest order).
finalize_entry() {
  [ -n "$_cur_name" ] || die "manifest plugin entry missing 'name' (path: ${_cur_path:-<none>})"
  [ -n "$_cur_path" ] || die "manifest plugin entry '$_cur_name' missing 'path'"
  PLUGIN_ENTRIES="$PLUGIN_ENTRIES$_cur_name|$_cur_path
"
  _cur_name=''
  _cur_path=''
}

capture_prop() {
  _cp_key=${1%%:*}
  case $_cp_key in
    name | path)
      _cp_val=${1#*:}
      _cp_val=${_cp_val#"${_cp_val%%[![:space:]]*}"}
      case $_cp_val in
        \"*\")
          _cp_val=${_cp_val#\"}
          _cp_val=${_cp_val%\"}
          ;;
        \'*\')
          _cp_val=${_cp_val#\'}
          _cp_val=${_cp_val%\'}
          ;;
      esac
      case $_cp_key in
        name) _cur_name=$_cp_val ;;
        path) _cur_path=$_cp_val ;;
      esac
      ;;
  esac
}

read_manifest_fields() {
  MANIFEST_PROFILE=''
  PLUGIN_ENTRIES=''
  _in_plugins=0
  _entry_indent=-1
  _cur_name=''
  _cur_path=''

  while IFS= read -r _line || [ -n "$_line" ]; do
    _lead=${_line%%[![:space:]]*}
    _indent=${#_lead}
    _body=${_line#"$_lead"}
    case $_body in
      '#'*) continue ;;
      '') continue ;;
    esac

    if [ "$_indent" -eq 0 ]; then
      if [ -n "$_cur_name" ] || [ -n "$_cur_path" ]; then
        finalize_entry
      fi
      _tl_key=${_body%%:*}
      case $_tl_key in
        profile)
          _tl_val=${_body#*:}
          _tl_val=${_tl_val#"${_tl_val%%[![:space:]]*}"}
          MANIFEST_PROFILE=$_tl_val
          ;;
        plugins) _in_plugins=1 ;;
        *) _in_plugins=0 ;;
      esac
      continue
    fi

    if [ "$_in_plugins" -eq 1 ]; then
      if [ "$_entry_indent" -lt 0 ]; then
        case $_body in
          - | -' '*) _entry_indent=$_indent ;;
        esac
      fi
      if [ "$_entry_indent" -ge 0 ] && [ "$_indent" -eq "$_entry_indent" ]; then
        case $_body in
          - | -' '*)
            if [ -n "$_cur_name" ] || [ -n "$_cur_path" ]; then
              finalize_entry
            fi
            capture_prop "${_body#'- '}"
            ;;
        esac
      elif [ "$_entry_indent" -ge 0 ] && [ "$_indent" -eq $((_entry_indent + 2)) ]; then
        case $_body in
          -' '*) ;;
          *) capture_prop "$_body" ;;
        esac
      fi
      # deeper indentation: config sub-block — deliberately ignored
    fi
  done < "$MANIFEST"

  if [ -n "$_cur_name" ] || [ -n "$_cur_path" ]; then
    finalize_entry
  fi
}

# ── helpers ────────────────────────────────────────────────────────────
is_skipped() {
  case " $SKIP_NAMES " in
    *" $1 "*) return 0 ;;
  esac
  return 1
}

is_present() {
  dsh plugin --profile "$PROFILE" list 2>/dev/null | grep -q "^$1[[:space:]]"
}

count() {
  case $1 in
    '') printf '0'; return ;;
  esac
  _c=1
  _rest=${1# }
  while :; do
    case $_rest in
      *' '*) _c=$((_c + 1)); _rest=${_rest#*' '} ;;
      *) break ;;
    esac
  done
  printf '%s' "$_c"
}

# Resolves a raw manifest path (after ${VAR} substitution) to an absolute
# path against the manifest directory. Sets ENTRY_NAME / ENTRY_PATH.
resolve_entry() {
  ENTRY_NAME=${1%%|*}
  subst_vars "${1#*|}"
  case $SUBST_RESULT in
    /*) ENTRY_PATH=$SUBST_RESULT ;;
    *) ENTRY_PATH=$MANIFEST_DIR/${SUBST_RESULT#./} ;;
  esac
}

print_summary() {
  printf '== load-plugins summary (profile: %s, mode: %s) ==\n' "$PROFILE" "$1"
  printf 'mounted:         %d%s\n' "$(count "$2")" "$2"
  printf 'already-present: %d%s\n' "$(count "$3")" "$3"
  printf 'failed:          %d%s\n' "$(count "$4")" "$4"
  printf 'skipped:         %d%s\n' "$(count "$5")" "$5"
}

# ── pre-flight chain ───────────────────────────────────────────────────
validate_yaml
check_top_level_keys
check_placeholders_defined
read_manifest_fields

[ -n "$PLUGIN_ENTRIES" ] || die "manifest declares no plugins (plugins: list is empty): $MANIFEST"

if [ -n "$PROFILE_FLAG" ]; then
  PROFILE=$PROFILE_FLAG
elif [ -n "$MANIFEST_PROFILE" ]; then
  subst_vars "$MANIFEST_PROFILE"
  PROFILE=$SUBST_RESULT
else
  die 'no profile determined: pass --profile or set profile: in the manifest'
fi

while IFS= read -r _row; do
  [ -n "$_row" ] || continue
  resolve_entry "$_row"
  [ -d "$ENTRY_PATH" ] || die "plugin '$ENTRY_NAME' path does not exist: $ENTRY_PATH"
  [ -f "$ENTRY_PATH/cordis.patch.yml" ] \
    || die "plugin '$ENTRY_NAME' has no cordis.patch.yml under: $ENTRY_PATH"
done <<EOF
$PLUGIN_ENTRIES
EOF

# ── unmount-all mode ───────────────────────────────────────────────────
if [ "$UNMOUNT_ALL" -eq 1 ]; then
  _removed=''
  _absent=''
  _failed=''
  _skipped=''
  while IFS= read -r _row; do
    [ -n "$_row" ] || continue
    resolve_entry "$_row"
    if is_skipped "$ENTRY_NAME"; then
      _skipped="$_skipped $ENTRY_NAME"
      continue
    fi
    if is_present "$ENTRY_NAME"; then
      printf 'remove:  %s (profile: %s)\n' "$ENTRY_NAME" "$PROFILE"
      if dsh plugin --profile "$PROFILE" remove "$ENTRY_NAME"; then
        _removed="$_removed $ENTRY_NAME"
      else
        _failed="$_failed $ENTRY_NAME"
        if [ "$STRICT" -eq 1 ]; then
          die "strict: unmount of $ENTRY_NAME failed; aborting"
        fi
      fi
    else
      _absent="$_absent $ENTRY_NAME"
    fi
  done <<EOF
$PLUGIN_ENTRIES
EOF
  printf '== load-plugins summary (profile: %s, mode: unmount-all) ==\n' "$PROFILE"
  printf 'removed:         %d%s\n' "$(count "$_removed")" "$_removed"
  printf 'already-absent:  %d%s\n' "$(count "$_absent")" "$_absent"
  printf 'failed:          %d%s\n' "$(count "$_failed")" "$_failed"
  printf 'skipped:         %d%s\n' "$(count "$_skipped")" "$_skipped"
  case $_failed in
    '') exit 0 ;;
    *) exit 1 ;;
  esac
fi

# ── dry-run mode: pre-flight only, zero dsh execution ──────────────────
if [ "$DRY_RUN" -eq 1 ]; then
  printf '== load-plugins dry-run (profile: %s) ==\n' "$PROFILE"
  _planned=0
  while IFS= read -r _row; do
    [ -n "$_row" ] || continue
    resolve_entry "$_row"
    if is_skipped "$ENTRY_NAME"; then
      printf 'skip:    %s (--skip)\n' "$ENTRY_NAME"
      continue
    fi
    printf 'plan: dsh plugin --profile %s add "link:%s"\n' "$PROFILE" "$ENTRY_PATH"
    _planned=$((_planned + 1))
  done <<EOF
$PLUGIN_ENTRIES
EOF
  printf 'dry-run: %d plugin(s) planned, 0 executed\n' "$_planned"
  exit 0
fi

# ── mount mode ─────────────────────────────────────────────────────────
_mounted=''
_present=''
_failed=''
_skipped=''

while IFS= read -r _row; do
  [ -n "$_row" ] || continue
  resolve_entry "$_row"
  if is_skipped "$ENTRY_NAME"; then
    _skipped="$_skipped $ENTRY_NAME"
    printf 'skip:    %s (--skip)\n' "$ENTRY_NAME"
    continue
  fi
  if is_present "$ENTRY_NAME"; then
    _present="$_present $ENTRY_NAME"
    printf 'present: %s (already mounted)\n' "$ENTRY_NAME"
    continue
  fi
  printf 'mount:   %s\n' "$ENTRY_NAME"
  if dsh plugin --profile "$PROFILE" add "link:$ENTRY_PATH"; then
    _mounted="$_mounted $ENTRY_NAME"
  else
    _failed="$_failed $ENTRY_NAME"
    if [ "$STRICT" -eq 1 ]; then
      print_summary mount "$_mounted" "$_present" "$_failed" "$_skipped"
      die "strict: mount of $ENTRY_NAME failed; aborting"
    fi
  fi
done <<EOF
$PLUGIN_ENTRIES
EOF

print_summary mount "$_mounted" "$_present" "$_failed" "$_skipped"

# ── start (summary first: the host runs in the foreground) ─────────────
if [ "$NO_START" -eq 0 ] && [ -z "$_failed" ]; then
  printf 'starting host (profile: %s)\n' "$PROFILE"
  # As-built: the `dsh web` subcommand is an alias of `--profile web` and
  # rejects a parent --profile; the design's literal
  # `dsh web --no-open --profile <p>` is not a valid CLI form.
  if [ "$PROFILE" = "web" ]; then
    exec dsh web --no-open
  else
    exec dsh --profile "$PROFILE"
  fi
fi

case $_failed in
  '') exit 0 ;;
  *) exit 1 ;;
esac
