---
title: "리눅스(Proton)에서 리듬게임 저지연 세팅: WineASIO, PipeWire, Wayland"
description: "EZ2ON REBOOT : R을 Steam Proton에서 Windows처럼 오프셋 0으로 즐기기까지. WineASIO + JACK(PipeWire), 버퍼 크기를 고정하는 래퍼 스크립트, 키 입력 지연을 줄이는 Wayland 드라이버."
pubDatetime: 2026-10-04T03:00:00+09:00
tags: ["linux", "proton", "wineasio", "pipewire", "wayland", "rhythm-game"]
---

EZ2ON REBOOT : R을 좋아한다. 리듬게임은 키를 누른 순간과 소리가 나는 순간 사이가 짧을수록 손맛이 좋은데, 이 게임은 그 부분을 정말 신경 써서 만들었다.
Windows에서는 ASIO 버퍼를 32샘플까지 내릴 수 있었고, 키 입력과 사운드 출력이 게임 화면 프레임과 따로 처리돼서 VSync를 켜 둬도 누르는 즉시 소리가 났다.
개발진의 노고가 느껴지는 부분이다.

최근 Windows가 점점 마음에 들지 않아 리눅스로 옮겨 보려고 한 적이 있다(Arch, btw). 그런데 리듬게임 소리 지연을 끝내 잡지 못해서 포기했다.

그러다 AI 코딩 에이전트가 로그를 읽고 소스까지 따라가며 원인을 짚어 주는 시대가 왔다.
혼자서는 어디서 막혔는지조차 알기 어려웠던 이 문제도 이제는 디버깅할 수 있지 않을까 싶어, 날을 잡고 다시 도전했다. 이 글은 그 결과를 정리한 것이다.

결론부터 말하면, 흔한 Proton 설정과 다른 점이 세 가지다.

1. 소리를 기본 PulseAudio 경로 대신 WineASIO로 내보내고, PipeWire의 JACK 호환 계층으로 받는다
2. 게임을 켜기 전에 PipeWire 버퍼 크기를 고정하는 래퍼 스크립트를 실행 옵션에 끼운다
3. 키 입력 지연을 줄이려고 Wine의 Wayland 드라이버(실험 기능)를 켠다

## 확인한 환경

| 항목     | 값                                                                                                             |
| -------- | -------------------------------------------------------------------------------------------------------------- |
| 배포판   | NixOS 26.05                                                                                                    |
| 커널     | 6.18, 일반 커널(RT 커널 아님), ntsync 모듈 로드                                                                |
| 오디오   | PipeWire 1.6.6 + rtkit(오디오 스레드 실시간 우선순위), wineasio 1.3.0, USB 오디오 인터페이스(Topping E1x2 OTG) |
| Proton   | GE-Proton11-7(BGA 영상 코덱 때문), Proton Hotfix(Valve, 비교용)                                                |
| 화면     | Wayland 컴포지터(niri), NVIDIA RTX 3080                                                                        |
| 게임     | EZ2ON REBOOT : R (Unity, 오디오는 FMOD, 게임 안에서 ASIO 장치를 고른다)                                        |
| 에이전트 | Claude Opus 5.5 + Paseo Daemon                                                                                 |

NixOS에서만 확인했다. 원리는 배포판과 상관없지만, 다른 배포판에서는 경로가 다를 수 있어 그 부분은 따로 적었다.
Flatpak으로 설치한 Steam은 확인하지 않았다(`pw-metadata`를 쓸 수 있는지, 컨테이너 안 경로가 다르다).

## 1. WineASIO + PipeWire의 JACK 호환

### 왜 기본 출력이 아닌가

Proton에서 게임 소리는 기본으로 Windows 오디오 API(WASAPI) → Wine의 `winepulse` → PipeWire의 PulseAudio 호환 계층으로 나간다.
데스크톱 소리와 같은 경로이고 대부분의 게임은 이걸로 충분하다. 다만 이 경로에서는 게임이 장치의 버퍼 크기를 직접 정하지 못하고,
Wine 쪽 버퍼와 Pulse 호환 계층의 버퍼가 겹겹이 쌓인다.

EZ2ON은 게임 안에서 ASIO 출력을 고를 수 있다. ASIO는 앱이 드라이버와 버퍼를 직접 주고받는 저지연 API이고,
WineASIO는 이 ASIO 호출을 JACK API로 옮겨 주는 Wine 드라이버다. 게임이 원래 의도한 저지연 경로를 그대로 쓰는 셈이다.

예전에는 JACK을 쓰려면 `jackd`가 오디오 장치를 독차지해서, 게임하는 동안 브라우저나 디스코드 소리를 따로 연결하거나 포기해야 했다.
PipeWire는 JACK API를 직접 제공하므로(`pipewire-jack`) JACK 클라이언트(WineASIO)와 Pulse 클라이언트(브라우저 등)가 **같은 오디오 그래프**에 함께 붙는다.
데스크톱 소리는 Pulse 쪽으로, 게임 소리는 JACK 쪽으로 같은 장치에 나간다.
(채널이 많은 오디오 인터페이스라 장치 채널이 그대로 보이는 Pro Audio 프로필을 썼다. 일반 스테레오 장치라면 따로 바꿀 필요는 없다.)

### 정말 필요했나: Pulse 경로와 비교

같은 게임에서 게임 안 장치만 PulseAudio 쪽으로 바꿔 비교했다. 판정 오프셋은 Windows에서처럼 0으로 뒀다.

| 경로                    | 그래프 크기 | PipeWire가 보고하는 지연 | 오프셋 0에서 체감                     |
| ----------------------- | ----------- | ------------------------ | ------------------------------------- |
| Pulse(기본)             | 512         | 256 frames(5.3ms)        | 키를 누르고 소리가 "바로" 나지 않는다 |
| Pulse + quantum 64 고정 | 64          | 64 frames(1.3ms)         | 위와 같다                             |
| WineASIO + quantum 64   | 64          | 64 frames(1.3ms)         | Windows와 똑같이 맞는다               |

quantum을 고정하는 방법은 2장에서 다룬다.

흥미로운 건 아래 두 줄의 숫자가 같다는 점이다. PipeWire(`jack_lsp -l`)가 보고하는 지연은 게임 스트림이 PipeWire에 **들어온 뒤**부터 장치까지다.
Pulse 경로에서 늦어지는 구간은 그 바깥, Wine 안에 있다. Wine의 `winepulse`는 WASAPI를 흉내 내며 주기를 정하고,
게임(FMOD)은 그 위에 자기 버퍼를 여러 개 더 잡는다. 이 버퍼들은 PipeWire 도구에 보이지 않는다. 그래서 quantum을 내려도 숫자만 좋아지고 소리는 여전히 늦다.

WineASIO는 게임이 버퍼 크기를 직접 정하고 PipeWire 그래프에 바로 쓰므로 이 바깥 구간이 없다.
보고값(64 frames)에 WineASIO 버퍼 64와 USB·DAC 몫을 더하면 소리 출력 지연은 대략 3~4ms다(계산값, 녹음으로 재지는 않았다).

정리하면 이 조합은 필요했다. 그리고 "데스크톱 소리는 평소대로, 게임은 ASIO처럼 저지연으로"를 `jackd` 없이 장치 하나로 이룬 건 PipeWire의 JACK 호환 덕이다.

### Proton에 붙이기: Proton 폴더가 아니라 `WINEDLLPATH`로

흔히 보이는 방법은 Proton의 `files/lib/wine/` 아래에 wineasio 파일을 복사하는 것이다. 이 방법은 Proton이 업데이트될 때마다 다시 해야 한다.

Proton(Valve·GE 모두)의 `proton` 스크립트는 환경의 `WINEDLLPATH`를 자기 DLL 경로 **뒤에 붙여** 준다.

```python
dllpaths = [g_proton.lib_dir + "vkd3d", g_proton.lib_dir + "wine"]
if "WINEDLLPATH" in os.environ:
    dllpaths.append(os.environ["WINEDLLPATH"])
```

그래서 wineasio를 홈 아래(`~/.local/share/wineasio`)에 두고 `WINEDLLPATH`로 가리키면 Proton 종류나 버전에 묶이지 않는다. 지정은 2장의 래퍼 스크립트가 한다.

### 빌드와 배치: 패키지 대신 직접 빌드한다

배포판이 주는 wineasio 패키지는 그대로 쓸 수 없었다(NixOS 패키지로 확인). 문제는 wineasio 소스의 한 줄이다.

wineasio는 드라이버를 열 때(`Init`) <strong><code>mlockall(MCL_FUTURE)</code></strong>를 부른다. 이 호출 뒤로는 프로세스가 새로 잡는 메모리가 모두 RAM에 고정되어야 하는데,
고정할 수 있는 한도(`RLIMIT_MEMLOCK`, 보통 수 MB)를 넘는 순간 메모리 할당이 전부 실패한다. 메모리를 크게 잡는 Wine과 게임은 버티지 못하고,
**게임 안에서 WineASIO를 고르자마자 죽는다.** upstream 코드에 들어 있는 호출이라 이걸 빼지 않은 패키지는 마찬가지다.

한도를 무제한으로 풀면 게임 메모리 수 GB가 통째로 RAM에 묶인다. 그래서 이 한 줄을 빼고 직접 빌드했다. 내 환경에서는 빼도 소리가 깨끗했다.
직접 빌드하는 김에 Proton에서 쓰기 위한 배치(파일 이름, libjack 경로)도 같이 한다.

필요한 것: Wine 개발 도구(`winegcc`·헤더), JACK 헤더, `patchelf`, `protontricks`, PipeWire 유틸(`pw-metadata`, `pw-top`).

wineasio 1.3.0을 64비트로 빌드한다.

```bash
git clone --recursive --branch v1.3.0 https://github.com/wineasio/wineasio && cd wineasio
sed -i '/mlockall(MCL_FUTURE);/d' asio.c   # 직접 빌드하는 이유. 이게 있으면 게임이 죽는다
make 64

d=~/.local/share/wineasio   # 이 경로가 WINEDLLPATH가 된다
mkdir -p $d/x86_64-windows $d/x86_64-unix
cp build64/wineasio64.dll    $d/x86_64-windows/
cp build64/wineasio64.dll.so $d/x86_64-unix/
ln -s wineasio64.dll.so      $d/x86_64-unix/wineasio.dll.so   # Wine은 이 이름으로 찾는다

# Proton 안에서도 PipeWire의 libjack을 찾도록 경로를 박아 둔다
patchelf --add-rpath <libjack.so.0이 있는 디렉터리> $d/x86_64-unix/wineasio64.dll.so
```

libjack 경로는 Proton 컨테이너 **안에서** 보이는 경로여야 한다.

- NixOS: `${pipewire.jack}/lib`. 컨테이너 안에서도 `/nix/store`가 보인다.
- 다른 배포판: 컨테이너 안에서 호스트의 `/usr`는 `/run/host/usr`로 보인다. PipeWire의 libjack 위치(예: `/usr/lib/x86_64-linux-gnu/pipewire-0.3/jack`, `/usr/lib64/pipewire-0.3/jack`)를 `/run/host/usr/...`로 바꿔 넣으면 될 것으로 본다(확인하지 않음).

### 게임 prefix에 등록

`regsvr32`는 DLL을 실제로 로드해야 해서 Proton 안에서는 실패하기 쉽다. wineasio의 `regsvr.c`가 쓰는 레지스트리 값을 그대로 넣으면 된다. 아래 내용을 `~/.local/share/wineasio/wineasio.reg`로 저장한다.

```reg
Windows Registry Editor Version 5.00

[HKEY_LOCAL_MACHINE\Software\ASIO\WineASIO]
"CLSID"="{48D0C522-BFCC-45CC-8B84-17F25F33E6E8}"
"Description"="WineASIO Driver"

[HKEY_CLASSES_ROOT\CLSID\{48D0C522-BFCC-45CC-8B84-17F25F33E6E8}]
@="WineASIO Object"

[HKEY_CLASSES_ROOT\CLSID\{48D0C522-BFCC-45CC-8B84-17F25F33E6E8}\InprocServer32]
@="wineasio64.dll"
"ThreadingModel"="Apartment"
```

게임 prefix는 Proton으로 게임을 한 번 실행해야 생긴다. 먼저 한 번 켰다 끈다.
Steam 라이브러리가 다른 드라이브에 있으면 `compatdata`도 그쪽 `steamapps` 아래에 있다.

```bash
appid=1477590   # 게임의 Steam appid
pfx=~/.local/share/Steam/steamapps/compatdata/$appid/pfx
# 껍데기 DLL을 system32에 둔다. 없으면 Wine이 WINEDLLPATH를 아예 보지 않는다
cp ~/.local/share/wineasio/x86_64-windows/wineasio64.dll $pfx/drive_c/windows/system32/
protontricks -c "wine reg import Z:$HOME/.local/share/wineasio/wineasio.reg" $appid
```

각 단계가 왜 필요한지는 [부록](#부록)에 로그와 함께 정리했다.

## 2. 래퍼 스크립트: 게임을 켜기 전에 버퍼 크기를 고정한다

wineasio는 기본이 "고정 모드"다. 드라이버를 여는 순간의 JACK 버퍼 크기를 기억하고, 그 크기 말고는 받아들이지 않는다.
그 뒤로 PipeWire 그래프의 크기가 바뀌면 게임에 재설정 요청만 보내고, 매 주기 실제 크기만큼만 복사한다. 이때 소리가 깨진다.

그래서 **게임을 켜기 전에** PipeWire 그래프를 원하는 크기로 고정해 둔다. 게임이 끝나면 되돌려야 하고, 1장의 `WINEDLLPATH`와 WineASIO 설정도 함께 넣어야 하니 Steam 실행 옵션에 끼우는 래퍼 스크립트로 만들었다.

아래를 `~/.local/bin/wineasio-run`으로 저장하고 `chmod +x ~/.local/bin/wineasio-run`으로 실행 권한을 준다.

```bash
#!/usr/bin/env bash
# 사용: Steam 실행 옵션에 `/home/<사용자>/.local/bin/wineasio-run 64 %command%` (절대 경로로)
quantum=$1; shift
pw-metadata -n settings 0 clock.force-quantum "$quantum" > /dev/null
trap 'pw-metadata -n settings 0 clock.force-quantum 0 > /dev/null' EXIT   # 끝나면 되돌린다
trap 'exit 130' INT TERM
export WINEDLLPATH="$HOME/.local/share/wineasio${WINEDLLPATH:+:$WINEDLLPATH}"
export WINEASIO_PREFERRED_BUFFERSIZE="$quantum"
export WINEASIO_NUMBER_INPUTS="${WINEASIO_NUMBER_INPUTS:-0}"
export WINEASIO_NUMBER_OUTPUTS="${WINEASIO_NUMBER_OUTPUTS:-2}"
"$@"
```

- 게임 안 ASIO 버퍼도 같은 값으로 맞춘다.
- `pw-top`에서 장치 드라이버와 게임 노드의 QUANT가 같은지(예: 64/48000)가 핵심이다. ERR(xrun)은 데이터가 늦을 때만 늘어서, 크기가 어긋나 소리가 깨질 때는 0으로 남는다.
- 내 환경에서는 64(약 1.3ms)가 깨끗했다. 이때 장치의 ALSA 버퍼는 period 64, buffer 192였다(`/proc/asound/card*/pcm0p/sub0/hw_params`).

다른 방법으로 맞추려다 생긴 증상은 [부록](#부록)에 정리했다.

## 3. Wayland 실험 기능으로 키 입력 지연 줄이기

소리를 64로 맞춰도 "누르자마자 소리가 나는" 느낌이 Windows와 달랐다. 게임 안 **VSync**를 끄면 사라졌는데, 원인은 VSync 자체가 아니라 Wine X11 드라이버의 입력 처리 방식이었다.

EZ2ON은 입력과 판정을 Unity 메인 루프와 따로 도는 스레드에서 처리한다. 그래서 Windows에서는 VSync를 켜도 입력이 바로 들어갔다. Windows 커널이 키 상태를 직접 갱신하기 때문이다.

Wine의 **X11 드라이버**는 다르다. 키 이벤트는 **게임 창을 가진 스레드가 메시지를 처리할 때** 비로소 Wine 서버의 키 상태에 들어간다. 그 스레드가 Unity 메인 루프다. 메인 루프가 VSync에서 기다리는 동안에는 별도 입력 스레드도 늦은 키 상태를 본다.

Wine의 **Wayland 드라이버**는 프로세스 시작 때 이벤트만 읽는 전용 스레드를 만들고(`wayland_read_events_thread`), 키보드 이벤트를 받는 즉시 넣는다(`NtUserSendHardwareInput`). 메인 루프가 기다리든 말든 입력 스레드가 최신 상태를 본다.

### 선택지

- **GE-Proton + Wayland 드라이버**: 실행 옵션에 `PROTON_ENABLE_WAYLAND=1`(GE-Proton의 스위치). VSync를 켜도 지연이 없었다.
  다만 Wine의 Wayland 드라이버는 **아직 실험 단계**라 게임에 따라 문제가 생길 수 있다.
- **X11 그대로**: 게임 안 VSync를 끈다. 검증된 조합이지만 키 입력은 결국 게임 프레임에 맞춰 반영되므로 그만큼 밀린다(240fps 기준 최대 약 4ms).

## 최종 구성

한 번만 하는 것:

1. wineasio를 `mlockall` 없이 빌드해 `~/.local/share/wineasio`에 배치(1장)
2. 게임을 한 번 실행해 prefix를 만든 뒤, `system32`에 껍데기 DLL 복사 + 레지스트리 등록(1장)
3. 래퍼 스크립트 `~/.local/bin/wineasio-run` 저장, 실행 권한(2장)

게임마다:

- 호환성 도구: **GE-Proton**. 플레이 중 나오는 BGA 영상이 코덱이 없으면 재생되지 않는데, GE-Proton은 Valve Proton에 없는 미디어 코덱을 함께 담고 있다. Wayland 스위치도 GE-Proton에만 있다.
- 실행 옵션:
  ```
  PROTON_ENABLE_WAYLAND=1 gamemoderun /home/<사용자>/.local/bin/wineasio-run 64 %command%
  ```
  `gamemoderun`은 선택이다(gamemode가 설치돼 있으면 게임 동안 CPU를 성능 모드로 둔다).
- 게임 안: 오디오 장치 WineASIO, 버퍼 64, VSync 켬
- 이 게임은 GE-Proton에서 종료 중에 멈춘다. 게임 정리는 끝난 뒤라 Steam의 "중지"로 끄면 된다(부록).

## 마치며

리듬게임을 제대로 못 한다는 이유 하나로 그동안 Windows를 버리지 못했다.
EZ2ON이 Windows와 같은 오프셋 0에서 그대로 맞는 지금, 리눅스에 정말로 정착할 수 있는 수준이 됐다.

인트로에서 꺼낸 AI 에이전트 이야기로 돌아가면, 이번 작업에서 에이전트가 한 일은 로그와 소스를 끝까지 따라가는 것이었다.
Proton 로그와 크래시 덤프를 읽고, Wine 로더 소스에서 `system32` 조건을, wineasio 소스에서 `mlockall`과 버퍼 복사 방식을, Wine Wayland 드라이버 소스에서 입력 스레드를 찾아냈다.
혼자였다면 "안 되네" 하고 접었을 지점들이다.
반대로 소리가 깨끗한지, 키를 누르는 순간이 Windows와 같은지는 결국 내 귀와 손으로 판단해야 했다. 에이전트의 짐작이 빗나간 적도 여러 번 있었다(부록의 버퍼 조율 표가 그 흔적이다).
시스템 설정은 에이전트가 NixOS 설정 레포에 PR로 올리고 내가 검토해 적용하는 식으로 나눴는데, 덕분에 하룻밤 사이 바꾼 것들이 전부 기록으로 남았다. 이 글도 그 기록에서 나왔다.

이제 메이플스토리 한글 입력 문제만 해결하면...

## 부록

조율하면서 있었던 일들이다. 같은 증상을 만난 사람에게 도움이 될까 해서 남긴다.

<details>
<summary>WineASIO를 Proton에 붙이며 만난 문제</summary>

### 1. `system32`에 껍데기가 없으면 `WINEDLLPATH`를 아예 안 본다

증상: 게임이 WineASIO를 찾긴 하는데 로드에 실패한다.

```
warn:module:load_dll Failed to load module L"wineasio64.dll"; status=c0000135
```

Wine(`dlls/ntdll/loader.c`의 `find_builtin_without_file`)은 prefix가 만들어진 뒤에는, `system32`에 파일이 없는 builtin DLL을 `WINEDLLPATH`에서 찾지 않는다(16비트만 예외).
`wineasio64.dll`은 코드가 없는 껍데기(`Wine placeholder DLL`)라서 `system32`에 복사해 두면, Wine이 그걸 보고 진짜 코드인 `.so`를 찾으러 간다.
공식 `wineasio-register` 스크립트도 같은 복사를 한다.

### 2. 껍데기의 내부 이름은 `wineasio.dll`

껍데기를 넣은 뒤 `WINEDEBUG=+loaddll,+module`로 보면 이렇게 나온다.

```
load_builtin L"\\??\\C:\\windows\\system32\\wineasio64.dll" is a fake Wine dll
find_builtin_dll looking for "wineasio.dll" for file L"...wineasio64.dll"
find_builtin_dll cannot find builtin library ...
```

껍데기 안에 적힌 이름이 `wineasio.dll`이라 Wine은 `x86_64-unix/wineasio.dll.so`를 찾는다. 본문의 `ln -s` 링크가 이것 때문이다.

### 3. `mlockall(MCL_FUTURE)`로 게임이 죽는다

wineasio가 로드되자마자 게임이 죽었다. 로그는 이렇다.

```
err:virtual:try_map_free_area mmap() error Resource temporarily unavailable ...
err:virtual:alloc_free_area_in_range Could not map in reserved area ...
```

원인과 대처는 본문 「빌드와 배치」에 적었다. Unity 게임이면 이 상태로 Unity 크래시 창이 뜰 수도 있다.

### 4. Proton 안에서는 libjack을 못 찾는다

wineasio는 `libjack.so.0`을 실행 중에 `dlopen`한다. Proton은 Steam Linux Runtime 컨테이너(pressure-vessel) 안에서 돌고 `LD_LIBRARY_PATH`를 자기 것으로 다시 짠다. 그래서 PipeWire의 libjack(`pw-jack`이 쓰는 라이브러리)이 잡히지 않는다.

`dlopen`은 **호출한 라이브러리의 RUNPATH**를 보므로, wineasio의 `.so`에 libjack 경로를 박아 둔다. 본문의 `patchelf` 단계가 이것이다.

</details>

<details>
<summary>버퍼 크기 조율 과정</summary>

게임 안 버퍼와 PipeWire 쪽 설정을 여러 방법으로 맞춰 봤다.

| 시도                                   | 결과                                                                                                               |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `PIPEWIRE_LATENCY=128/48000`, 게임 128 | 귀를 찢는 전자음. `pw-top`에서 그래프는 256으로 돌았다(요청일 뿐이라 반영되지 않음)                                |
| `PIPEWIRE_QUANTUM=32/48000`, 게임 128  | 소리가 잘게 조각나서 들린다. 게임 버퍼를 128 미만으로 내리면 무음                                                  |
| `WINEASIO_FIXED_BUFFERSIZE=0`          | 게임에서 버퍼를 바꿔도 그래프는 256 그대로(wineasio의 버퍼 변경 요청이 반영되지 않음). 128 미만 무음, 128은 조각남 |
| `PIPEWIRE_QUANTUM=128/48000`, 게임 128 | 소리가 2배속쯤으로 빨라진다                                                                                        |
| 게임 시작 전 그래프 고정 32            | 크기는 맞지만(`pw-top` 32/48000) 소리 톤이 이상하다. 0.67ms 주기는 버거웠던 것 같다                                |
| 게임 시작 전 그래프 고정 64·128·256    | 깨끗하다                                                                                                           |

이상한 소리가 나는 동안에도 `pw-top`의 ERR(xrun)은 0이었다. 데이터는 제때 와 있었고,
wineasio가 기억한 버퍼 크기와 PipeWire가 실제로 도는 크기가 어긋나 매 주기 버퍼의 일부만, 또는 엉뚱한 부분이 섞여 나간 것이다.
wineasio는 매 주기 게임에 다음 버퍼를 채우게 한 뒤(`bufferSwitch`) PipeWire가 요구한 길이(`nframes`)만큼만 복사한다(`asio.c`의 `jack_process_callback`).

</details>

<details>
<summary>Proton 선택 과정</summary>

- 처음에는 Valve의 Proton Hotfix로 X11에서 돌렸다. 종료까지 깔끔하지만 BGA 영상이 코덱 문제로 나오지 않았고, VSync를 끄지 않으면 입력이 밀렸다(본문 3장).
- Wayland 드라이버를 쓰려고 Proton Hotfix에서 레지스트리(`HKCU\Software\Wine\Drivers`의 `Graphics=wayland`)만 바꾸면 `winewayland.drv`가 초기화부터 실패해 창이 뜨지 않았다.
  GE-Proton의 `PROTON_ENABLE_WAYLAND=1`은 드라이버 지정 외에 `winewayland.drv=b`, `WINE_USE_EGL=1` 등을 함께 건다. Valve Proton 스크립트에는 이 스위치가 없다.
- GE-Proton(11-7, 11-1 모두)에서는 이 게임이 **종료 중에 멈춘다.** Steam API를 정리한 직후 작업 스레드들이 멈춘다.
  fsync를 끄거나 ntsync로 돌려도, Steam 오버레이를 꺼도 같았다. 게임 정리는 끝난 뒤라 Steam의 "중지"로 끄면 된다.
- Wayland로 뜬 창은 app-id가 실행 파일 이름(`ez2on.exe`)이라, 컴포지터 창 규칙이 `steam_app_*` 기준이면 따로 더해야 한다.

</details>
