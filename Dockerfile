# 因为官方的nginx:latest没有UTF-8支持，所以这里需要手动添加进行构建
# 主要原因是webdav路径有中文，nginx默认是ASCII编码，会导致路径显示乱码，所以这里需要添加UTF-8支持
FROM nginx:latest

RUN apt-get update && apt-get install -y \
    vim curl wget telnet net-tools iputils-ping dnsutils \
    procps lsof unzip zip tar less ca-certificates locales \
    && echo "zh_CN.UTF-8 UTF-8" >> /etc/locale.gen \
    && locale-gen \
    && update-locale LANG=zh_CN.UTF-8 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

ENV LANG=zh_CN.UTF-8
ENV LANGUAGE=zh_CN:zh
ENV LC_ALL=zh_CN.UTF-8

CMD ["nginx", "-g", "daemon off;"]