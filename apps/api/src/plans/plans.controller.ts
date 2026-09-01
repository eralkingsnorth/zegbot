import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { CreatePlanRequest, UpdatePlanRequest } from '@zegbot/shared';
import { AdminGuard } from '../auth/jwt.guard';
import { PlansService } from './plans.service';

@Controller()
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  @Get('plans')
  listPublic() {
    return this.plans.listPublic();
  }

  @Get('admin/plans')
  @UseGuards(AdminGuard)
  listAll() {
    return this.plans.listAll();
  }

  @Post('admin/plans')
  @UseGuards(AdminGuard)
  create(@Body() body: CreatePlanRequest) {
    return this.plans.create(body);
  }

  @Patch('admin/plans/:id')
  @UseGuards(AdminGuard)
  update(@Param('id') id: string, @Body() body: UpdatePlanRequest) {
    return this.plans.update(id, body);
  }

  @Delete('admin/plans/:id')
  @UseGuards(AdminGuard)
  remove(@Param('id') id: string) {
    return this.plans.remove(id);
  }
}
