我给你在工程目录写了一个一键脚本：build_tipa.sh，内容就是把那三步串起来并加了必要的检查/清理。

  脚本路径：

  - Apple-app/Lanook/build_tipa.sh

  如何执行（两步）：

  1. 进入工程目录：

  cd /Users/wang/Documents/Lanook/Apple-app/Lanook

  2. 一键打包：

  ./build_tipa.sh

  执行完会输出产物路径：

  - Apple-app/Lanook/build/tipa/Lanook.tipa

  如果你在终端里提示“权限不够”，先跑一次：

  chmod +x build_tipa.sh

  再执行 ./build_tipa.sh 即可。