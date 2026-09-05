# Engine/OS pin verified against the Docker Hub registry; see image-lock.json.
FROM clamav/clamav:1.5.4_base-debian13-slim@sha256:2bc2f9c5c1fd5120a334490d005c694430f0589d085a7aca400bbd93458fe1f0 AS upstream

# Copy the pinned runtime without inheriting its milter EXPOSE or startup script.
FROM scratch
COPY --from=upstream / /
ENV PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
    TZ=Etc/UTC \
    SIGNATURE_MAX_AGE_HOURS=48
COPY clamd.conf freshclam.conf /etc/clamav/
COPY start.sh /usr/local/bin/irb-clamav-start
COPY health.sh /usr/local/bin/irb-clamav-health
RUN chmod 0755 /usr/local/bin/irb-clamav-start /usr/local/bin/irb-clamav-health \
    && command -v timeout nc date clamd freshclam \
    && clamd --version | grep -q '^ClamAV 1\.5\.4'
EXPOSE 3310/tcp
HEALTHCHECK --interval=30s --timeout=12s --start-period=12m --retries=2 CMD ["/usr/local/bin/irb-clamav-health"]
ENTRYPOINT ["/usr/local/bin/irb-clamav-start"]
