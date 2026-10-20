# Build do backend (Spring Boot 4 / JDK 21) usando o wrapper mvnw.
# O build context e a pasta do repo do backend (BACKEND_DIR); este arquivo
# mora em pca-setup/ e e referenciado pelo compose via STACK_DIR.
FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY . .
RUN ./mvnw -q -DskipTests clean package

FROM eclipse-temurin:21-jre
WORKDIR /app
RUN useradd -r -u 1001 appuser
COPY --from=build /app/target/projeto-amar-*.jar app.jar
USER appuser
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
