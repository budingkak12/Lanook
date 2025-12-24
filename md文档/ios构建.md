# Lanook iOS 未签名 IPA/TIPA 构建指引
适用场景：为越狱/TrollStore 设备产出可安装包，无需苹果证书。项目根目录为 `Lanook/`，iOS 工程位于 `Apple-app/Lanook/`。

## 前置条件
- macOS + Xcode（已包含 iOS SDK）。
- 已安装 `ldid`（伪签）：`brew install ldid`。

## 一键命令（在 `Apple-app/Lanook` 目录执行）
```bash
# 1) 不签名编译真机 Release 版 .app
xcodebuild -scheme Lanook -configuration Release -sdk iphoneos \
  CODE_SIGNING_ALLOWED=NO CODE_SIGN_IDENTITY="" PROVISIONING_PROFILE_SPECIFIER="" \
  ENABLE_BITCODE=NO -derivedDataPath build

# 2) 伪签可执行文件（默认 entitlements）
ldid -S build/Build/Products/Release-iphoneos/Lanook.app/Lanook

# 3) 打包为 TrollStore 可识别的 .tipa（IPA 同理）
rm -rf build/tipa && mkdir -p build/tipa/Payload
cp -R build/Build/Products/Release-iphoneos/Lanook.app build/tipa/Payload/
(cd build/tipa && zip -r Lanook.tipa Payload)
```
产物：`Apple-app/Lanook/build/tipa/Lanook.tipa`。

## 可选：自定义 entitlements
若需额外权限（如去沙盒），在工程目录创建 `entitlements.plist`，示例：
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>com.apple.private.security.no-container</key><true/>
    <key>com.apple.private.security.no-sandbox</key><true/>
  </dict>
</plist>
```
然后伪签时使用：
```bash
ldid -Sentitlements.plist build/Build/Products/Release-iphoneos/Lanook.app/Lanook
```
（不要加入 Apple 已封禁的能力，否则会崩溃或无法安装。）

## 安装到设备（TrollStore/巨魔商店）
1. 用 AirDrop/USB 将 `Lanook.tipa` 拷贝到 iPhone 的“文件”App。
2. 在“文件”中点开 → 分享 → 选择巨魔商店（或在巨魔商店内导入）。
3. 安装完成后重启一次，确认图标仍在且可正常启动。

## 验证与常见问题
- 首次启动出现权限弹窗（相册、网络等）正常授权即可。
- 若提示权限不足/闪退，检查是否需要自定义 entitlements 后重新伪签。
- 要重新生成包，先 `rm -rf build/tipa` 再重复“一键命令”即可。
