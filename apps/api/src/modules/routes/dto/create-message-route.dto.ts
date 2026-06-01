export class CreateMessageRouteDto {
  userId!: string;
  sessionId!: string;
  sourceGroupJid!: string;
  destinationGroupJid!: string;
}
