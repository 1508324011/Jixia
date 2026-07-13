-- CreateIndex
CREATE UNIQUE INDEX "AIModelProfile_providerConfigId_model_key" ON "AIModelProfile"("providerConfigId", "model");
